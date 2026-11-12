"""Exercise real yt-dlp + FFmpeg against our generated audio, never third-party media."""
import json
import shutil
import subprocess
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import pytest
from converter import convert_to_mp3
from extractor import extract_playlist


@pytest.fixture
def owned_source(tmp_path):
    if not shutil.which('ffmpeg'):
        pytest.skip('FFmpeg is required for the real conversion check')
    for name in ['first', 'second']:
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'pcm_s16le', str(tmp_path / f'{name}.wav')], check=True, timeout=15)
    (tmp_path / 'playlist.html').write_text('<html><head><title>Owned recordings</title></head><body><audio controls src="first.wav"></audio><audio controls src="second.wav"></audio></body></html>')
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *args): pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(tmp_path)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}'
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=2)


def test_real_owned_audio_conversion_and_progress(owned_source, tmp_path):
    output = tmp_path / 'converted'; output.mkdir()
    audio = convert_to_mp3(f'{owned_source}/first.wav', str(output), 128)
    assert audio.name == 'audio.mp3'
    assert audio.stat().st_size > 1000
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(audio)], check=True, capture_output=True, timeout=10)
    assert float(json.loads(result.stdout)['format']['duration']) >= .9
    progress = json.loads((output / 'progress.json').read_text())
    assert progress['phase'] in {'processing', 'converting'}
    assert progress['percent'] is None


def test_real_owned_html_playlist_preserves_order(owned_source):
    # Direct extractor test with owned local fixtures; the production endpoint still
    # rejects private addresses/ports. No production validation is disabled.
    result = extract_playlist(f'{owned_source}/playlist.html')
    assert len(result['tracks']) == 2
    assert result['tracks'][0]['media']['source_url'].endswith('/first.wav')
    assert result['tracks'][1]['media']['source_url'].endswith('/second.wav')
