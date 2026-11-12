from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_health() -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_download_requires_authorization() -> None:
    response = client.post(
        "/api/download",
        json={"url": "https://example.com/song.mp3", "format": "mp3"},
    )
    assert response.status_code == 403


def test_download_rejects_non_http_urls() -> None:
    response = client.post(
        "/api/download",
        json={"url": "file:///tmp/song.mp3", "format": "mp3", "authorized": True},
    )
    assert response.status_code == 400


def test_download_get_requires_authorization() -> None:
    response = client.get(
        "/api/download",
        params={"url": "https://example.com/song.mp3", "format": "mp3"},
    )
    assert response.status_code == 403

import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
import main
import extractor
import converter
from fastapi import HTTPException


@pytest.fixture(autouse=True)
def public_dns(monkeypatch):
    original = extractor.socket.getaddrinfo
    monkeypatch.setattr(extractor.socket, "getaddrinfo", lambda host, *args, **kwargs: [(2, 1, 6, "", ("93.184.216.34", 0))] if host == "example.com" else original(host, *args, **kwargs))


@pytest.mark.parametrize("url", ["file:///tmp/audio", "ftp://example.com/song", "https://user:pass@example.com/a", "http://example.com:999/a", "http://example.com:bad/a"])
def test_invalid_sources(url):
    assert client.get("/api/media", params={"url": url}).status_code == 400


def test_private_source_rejected(monkeypatch):
    monkeypatch.setattr(extractor.socket, "getaddrinfo", lambda *args: [(2, 1, 6, "", ("127.0.0.1", 0))])
    assert client.get("/api/media", params={"url": "http://localhost/a"}).status_code == 400


def test_search_and_format_metadata(monkeypatch):
    def extract(source):
        assert source == "ytsearch10:tempo"
        return {"_type": "playlist", "entries": [None, {"id": "x", "title": "Song", "channel": "Artist", "webpage_url": "https://example.com/x", "duration": 65.5, "formats": [{"format_id": "a", "ext": "m4a", "acodec": "aac", "abr": 127.7, "filesize_approx": 123.5}]}]}
    monkeypatch.setattr(main, "extract_info", extract)
    result = client.get("/api/search", params={"query": "tempo"}).json()[0]
    assert result["artist"] == "Artist"
    assert result["formats"][0]["audio_bitrate"] == 128
    assert result["download_url"] is None


@pytest.mark.parametrize("restriction", [{"is_live": True}, {"has_drm": True}, {"availability": "needs_auth"}, {"availability": "private"}, {"availability": "premium_only"}])
def test_restricted_media_not_downloadable(restriction):
    assert not extractor.to_result({"webpage_url": "https://example.com/x", **restriction}).downloadable


def test_blank_search_rejected():
    assert client.get("/api/search", params={"query": "  "}).status_code == 400


def test_url_lookup_uses_extractor(monkeypatch):
    monkeypatch.setattr(main, "extract_info", lambda source: {"id": "x", "webpage_url": source})
    result = client.get("/api/media", params={"url": "https://example.com/x"})
    assert result.status_code == 200
    assert result.json()["source_url"] == "https://example.com/x"


@pytest.mark.parametrize("quality", [64, 256, 999])
def test_invalid_output_bitrate(quality):
    assert client.post("/api/download", json={"url": "https://example.com/x", "authorized": True, "quality": quality}).status_code == 422


def test_stream_has_length_quality_and_cleanup(monkeypatch, tmp_path):
    directory = tmp_path / "download"
    directory.mkdir()
    monkeypatch.setattr(main.tempfile, "mkdtemp", lambda **kwargs: str(directory))
    class Process:
        returncode = 0
        async def communicate(self):
            return b"", b""
    async def start(*args, **kwargs):
        assert args[-2:] == ("320", "mp3")
        (directory / "audio.mp3").write_bytes(b"ID3audio")
        return Process()
    monkeypatch.setattr(main.asyncio, "create_subprocess_exec", start)
    result = client.get("/api/download", params={"url": "https://example.com/x", "authorized": True, "quality": 320})
    assert result.status_code == 200
    assert result.content == b"ID3audio"
    assert result.headers["content-length"] == "8"
    assert result.headers["content-type"] == "audio/mpeg"
    assert not directory.exists()


def test_conversion_failure_cleans_files(monkeypatch, tmp_path):
    directory = tmp_path / "failed"
    directory.mkdir()
    monkeypatch.setattr(main.tempfile, "mkdtemp", lambda **kwargs: str(directory))
    class Process:
        returncode = 1
        async def communicate(self):
            return json.dumps({"status": 503, "detail": "Install FFmpeg."}).encode(), b""
    monkeypatch.setattr(main.asyncio, "create_subprocess_exec", AsyncMock(return_value=Process()))
    result = client.get("/api/download", params={"url": "https://example.com/x", "authorized": True})
    assert result.status_code == 503
    assert not directory.exists()


def test_converter_rejects_protected_media(monkeypatch, tmp_path):
    monkeypatch.setattr(converter.shutil, "which", lambda _: "/usr/bin/ffmpeg")
    monkeypatch.setattr(converter, "extract_info", lambda _: {"webpage_url": "https://example.com/x", "has_drm": True})
    with pytest.raises(HTTPException) as error:
        converter.convert_to_mp3("https://example.com/x", str(tmp_path))
    assert error.value.status_code == 422


def test_converter_requires_ffmpeg(monkeypatch, tmp_path):
    monkeypatch.setattr(converter.shutil, "which", lambda _: None)
    with pytest.raises(HTTPException) as error:
        converter.convert_to_mp3("https://example.com/x", str(tmp_path))
    assert error.value.status_code == 503


def test_converter_passes_bitrate_and_renames(monkeypatch, tmp_path):
    monkeypatch.setattr(converter.shutil, "which", lambda _: "/usr/bin/ffmpeg")
    monkeypatch.setattr(converter, "extract_info", lambda _: {"webpage_url": "https://example.com/x"})
    class Downloader:
        def __init__(self, options):
            assert options["postprocessors"][0]["preferredquality"] == "128"
            assert not options.get("allow_unplayable_formats")
            assert "cookiefile" not in options
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def download(self, sources): (tmp_path / "source.mp3").write_bytes(b"ID3audio")
    monkeypatch.setattr(converter.yt_dlp, "YoutubeDL", Downloader)
    assert converter.convert_to_mp3("https://example.com/x", str(tmp_path), 128).read_bytes() == b"ID3audio"


def test_disconnect_kills_worker_and_removes_temporary_files(monkeypatch, tmp_path):
    directory = tmp_path / "cancelled"
    directory.mkdir()
    monkeypatch.setattr(main.tempfile, "mkdtemp", lambda **kwargs: str(directory))
    killed = []
    monkeypatch.setattr(main.os, "killpg", lambda pid, sig: killed.append(pid))
    async def run():
        done = asyncio.Event()
        class Process:
            returncode = None
            pid = 123456
            async def communicate(self):
                await done.wait()
                return b"", b""
            async def wait(self):
                self.returncode = -9
                done.set()
        class Request:
            async def is_disconnected(self): return True
        monkeypatch.setattr(main.asyncio, "create_subprocess_exec", AsyncMock(return_value=Process()))
        with pytest.raises(HTTPException) as error:
            await main.create_download(Request(), main.DownloadRequest(url="https://example.com/x", authorized=True))
        assert error.value.status_code == 499
    asyncio.run(run())
    assert killed == [123456]
    assert not directory.exists()


def test_real_ytdlp_ffmpeg_conversion_of_owned_audio(tmp_path):
    """Generate our own audio; exercise actual extraction and FFmpeg without a provider."""
    import functools
    import http.server
    import shutil
    import subprocess
    import threading
    if not shutil.which("ffmpeg"):
        pytest.skip("FFmpeg not installed")
    source = tmp_path / "owned.wav"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.25", str(source)], check=True)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(tmp_path))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    destination = tmp_path / "output"
    destination.mkdir()
    try:
        output = converter.convert_to_mp3(f"http://127.0.0.1:{server.server_port}/owned.wav", str(destination), 128)
        assert output.stat().st_size > 0
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", str(output)], capture_output=True, text=True, check=True)
        assert probe.stdout.strip() == "mp3"
        original_directory = tmp_path / "original"
        original_directory.mkdir()
        original = converter.download_original(f"http://127.0.0.1:{server.server_port}/owned.wav", str(original_directory))
        assert original.suffix == ".wav"
        assert original.read_bytes() == source.read_bytes()
        import sys
        worker_directory = tmp_path / "worker-original"
        worker_directory.mkdir()
        subprocess.run([sys.executable, str(Path(main.__file__).with_name("worker.py")),
                        f"http://127.0.0.1:{server.server_port}/owned.wav", str(worker_directory),
                        "192", "original"], check=True, capture_output=True, timeout=30)
        assert (worker_directory / "audio.wav").read_bytes() == source.read_bytes()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_original_preserves_bytes_without_postprocessing(monkeypatch, tmp_path):
    monkeypatch.setattr(converter, "extract_info", lambda _: {"webpage_url": "https://example.com/a"})
    audio = b"\x1a\x45\xdf\xa3original opus stream"
    class Downloader:
        def __init__(self, options):
            assert options["format"] == "bestaudio"
            assert options["postprocessors"] == []
            assert options["fixup"] == "never"
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def download(self, sources): (tmp_path / "audio.webm").write_bytes(audio)
    monkeypatch.setattr(converter.yt_dlp, "YoutubeDL", Downloader)
    result = converter.download_original("https://example.com/a", str(tmp_path))
    assert result.suffix == ".webm"
    assert result.read_bytes() == audio


def test_original_rejects_protected_media(monkeypatch, tmp_path):
    monkeypatch.setattr(converter, "extract_info", lambda _: {"webpage_url": "https://example.com/a", "has_drm": True})
    with pytest.raises(HTTPException) as error:
        converter.download_original("https://example.com/a", str(tmp_path))
    assert error.value.status_code == 422


def test_extractor_does_not_fabricate_forwarded_ips_for_restricted_regions():
    import yt_dlp
    from yt_dlp.extractor.common import InfoExtractor

    with yt_dlp.YoutubeDL(extractor.extractor_options()) as downloader:
        probe = InfoExtractor(downloader)
        probe._initialize_geo_bypass({'ip_blocks': ['203.0.113.0/24'], 'countries': ['US']})
        assert probe._x_forwarded_for_ip is None
