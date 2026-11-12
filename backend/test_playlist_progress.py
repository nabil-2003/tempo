import asyncio
import json
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
import extractor
import main
from progress import ProgressWriter, download_hook


def fake_extractor(monkeypatch, info):
    class Fake:
        def __init__(self, options):
            assert not options['noplaylist']
            assert options['geo_bypass'] is False
            assert options['playlistend'] == 501
            assert options['extract_flat'] == 'in_playlist'
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def extract_info(self, *args, **kwargs): return info
    monkeypatch.setattr(extractor.yt_dlp, 'YoutubeDL', Fake)


def test_playlist_order_and_unavailable_entries(monkeypatch):
    fake_extractor(monkeypatch, {'_type': 'playlist', 'title': 'Owned collection', 'entries': [
        {'id': 'b', 'title': 'B', 'url': 'https://example.com/b'}, None,
        {'id': 'a', 'title': '[Private video]', 'url': 'https://example.com/a'},
        {'id': 'b', 'title': 'B', 'url': 'https://example.com/b'}]})
    result = extractor.extract_playlist('https://example.com/playlist')
    assert [t['index'] for t in result['tracks']] == [0, 1, 2, 3]
    assert result['tracks'][0]['media']['title'] == 'B'
    assert result['tracks'][1]['error']
    assert not result['tracks'][2]['media']['downloadable']
    assert result['tracks'][3]['media']['id'] == 'b'


@pytest.mark.parametrize('info', [{'_type': 'video'}, {'_type': 'playlist', 'entries': []}, {'_type': 'playlist', 'entries': [None] * 501}])
def test_playlist_rejects_non_playlist_empty_or_oversized(monkeypatch, info):
    fake_extractor(monkeypatch, info)
    with pytest.raises(HTTPException) as error:
        extractor.extract_playlist('https://example.com/playlist')
    assert error.value.status_code == 422


def test_real_hook_bytes_and_indeterminate_conversion(tmp_path):
    report = ProgressWriter(tmp_path)
    hook = download_hook(report)
    hook({'status': 'downloading', 'downloaded_bytes': 25, 'total_bytes': 100})
    assert json.loads((tmp_path / 'progress.json').read_text()) == {'phase': 'source_download', 'bytes': 25, 'total': 100, 'percent': 25.0, 'estimated': False}
    hook({'status': 'finished'})
    assert json.loads((tmp_path / 'progress.json').read_text())['percent'] is None
    assert not (tmp_path / 'progress.tmp').exists()


def test_progress_survives_status_poll_until_ready(monkeypatch, tmp_path):
    async def convert(request, data):
        request.on_progress({'phase': 'source_download', 'percent': 42, 'bytes': 42, 'total': 100})
        await asyncio.sleep(.05)
        (tmp_path / 'audio.mp3').write_bytes(b'ID3audio')
        return main.TemporaryAudioResponse(str(tmp_path))
    monkeypatch.setattr(main, 'create_download', convert)
    with TestClient(main.app) as client:
        job_id = client.post('/api/downloads', json={'url': 'https://example.com/a', 'authorized': True}).json()['id']
        status = client.get(f'/api/downloads/{job_id}').json()
        assert status['progress']['percent'] == 42
        assert status['status'] == 'preparing'


def test_playlist_name_search_filters_and_deduplicates_without_resolving_tracks(monkeypatch):
    from urllib.parse import parse_qs, urlparse
    class Search:
        def __init__(self, options):
            assert options['extract_flat'] is True
            assert options['playlistend'] == 10
            assert options['geo_bypass'] is False
            assert 'cookiefile' not in options
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def extract_info(self, source, download):
            assert download is False
            params = parse_qs(urlparse(source).query)
            assert params == {'search_query': ['Own & licensed'], 'sp': ['EgIQAw==']}
            return {'entries': [None,
                {'id': 'PL123', 'title': 'Own recordings', 'channel': 'Curator', 'url': 'https://www.youtube.com/playlist?list=PL123', 'playlist_count': 8},
                {'id': 'PL123', 'url': 'https://www.youtube.com/playlist?list=PL123'},
                {'id': 'video', 'url': 'https://www.youtube.com/watch?v=abcdefghijk'},
                {'id': 'bad', 'url': 'https://example.com/playlist?list=PLfake'},
                {'id': 'PL456', 'title': 'Licensed recordings', 'url': 'https://www.youtube.com/playlist?list=PL456', 'thumbnails': [{'url': 'https://example.com/art.jpg'}]},
            ]}
    monkeypatch.setattr(extractor.yt_dlp, 'YoutubeDL', Search)
    with TestClient(main.app) as client:
        result = client.get('/api/playlists/search', params={'query': ' Own & licensed '}).json()
    assert [r['id'] for r in result] == ['PL123', 'PL456']
    assert result[0]['artist'] == 'Curator'
    assert result[0]['track_count'] == 8
    assert result[1]['thumbnail_url'] == 'https://example.com/art.jpg'


@pytest.mark.parametrize('query', ['', ' ', 'https://example.com/playlist', 'a' * 201])
def test_playlist_name_search_rejects_invalid_query(query):
    with TestClient(main.app) as client:
        assert client.get('/api/playlists/search', params={'query': query}).status_code in {400, 422}
