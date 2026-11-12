import asyncio
import threading
import time

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import main
from jobs import JobStore


def wait_ready(client, job_id):
    for _ in range(100):
        response = client.get(f"/api/downloads/{job_id}")
        if response.json()["status"] != "preparing":
            return response.json()
        time.sleep(0.01)
    raise AssertionError("Job did not finish")


def test_job_requires_authorization():
    with TestClient(main.app) as client:
        assert client.post("/api/downloads", json={"url": "https://example.com/a"}).status_code == 403


def test_slow_job_returns_immediately_then_streams_ready_file(monkeypatch, tmp_path):
    directory = tmp_path / "job"
    directory.mkdir()
    (directory / "audio.mp3").write_bytes(b"ID3audio")
    async def convert(request, data):
        assert data.authorized
        await asyncio.sleep(0.1)
        return main.TemporaryAudioResponse(str(directory))
    monkeypatch.setattr(main, "create_download", convert)
    with TestClient(main.app) as client:
        result = client.post("/api/downloads", json={"url": "https://example.com/a", "authorized": True})
        assert result.status_code == 202
        job_id = result.json()["id"]
        assert client.get(f"/api/downloads/{job_id}").json()["status"] == "preparing"
        assert client.get(f"/api/downloads/{job_id}/file").status_code == 409
        assert wait_ready(client, job_id)["status"] == "ready"
        result = client.get(f"/api/downloads/{job_id}/file")
        assert result.content == b"ID3audio"
        assert result.headers["content-length"] == "8"
        assert not directory.exists()
        assert client.get(f"/api/downloads/{job_id}").status_code == 404


def test_job_error_is_exposed(monkeypatch):
    async def convert(*args):
        raise HTTPException(422, "The source is protected.")
    monkeypatch.setattr(main, "create_download", convert)
    with TestClient(main.app) as client:
        job_id = client.post("/api/downloads", json={"url": "https://example.com/a", "authorized": True}).json()["id"]
        result = wait_ready(client, job_id)
        assert result["status"] == "failed"
        assert result["detail"] == "The source is protected."
        assert client.delete(f"/api/downloads/{job_id}").status_code == 204


def test_cancellation_stops_conversion(monkeypatch):
    started = threading.Event()
    stopped = threading.Event()
    async def convert(*args):
        started.set()
        try:
            await asyncio.sleep(60)
        finally:
            stopped.set()
    monkeypatch.setattr(main, "create_download", convert)
    with TestClient(main.app) as client:
        job_id = client.post("/api/downloads", json={"url": "https://example.com/a", "authorized": True}).json()["id"]
        assert started.wait(1)
        assert client.delete(f"/api/downloads/{job_id}").status_code == 204
        assert stopped.wait(1)
        assert client.get(f"/api/downloads/{job_id}").status_code == 404
        assert client.delete(f"/api/downloads/{job_id}").status_code == 204


def test_shutdown_removes_unclaimed_ready_files(monkeypatch, tmp_path):
    directory = tmp_path / "unclaimed"
    directory.mkdir()
    async def convert(*args):
        return main.TemporaryAudioResponse(str(directory))
    monkeypatch.setattr(main, "create_download", convert)
    with TestClient(main.app) as client:
        job_id = client.post("/api/downloads", json={"url": "https://example.com/a", "authorized": True}).json()["id"]
        assert wait_ready(client, job_id)["status"] == "ready"
    assert not directory.exists()


def test_queue_capacity_is_bounded():
    async def run():
        store = JobStore()
        store.max_jobs = 1
        store.start(lambda: asyncio.sleep(60))
        with pytest.raises(HTTPException) as error:
            store.start(lambda: asyncio.sleep(60))
        assert error.value.status_code == 429
        await store.close()
    asyncio.run(run())


def test_expiry_removes_abandoned_ready_files(tmp_path):
    directory = tmp_path / "expired"
    directory.mkdir()
    async def run():
        store = JobStore()
        async def convert():
            return main.TemporaryAudioResponse(str(directory))
        job = store.start(convert)
        await job.task
        job.created_at -= store.ttl_seconds + 1
        await store.expire()
        assert not directory.exists()
        with pytest.raises(HTTPException) as error:
            store.get(job.id)
        assert error.value.status_code == 404
    asyncio.run(run())


def test_original_job_keeps_extension_and_stream_mime(monkeypatch, tmp_path):
    directory = tmp_path / "original"
    directory.mkdir()
    audio = b"\x1a\x45\xdf\xa3original stream"
    (directory / "audio.webm").write_bytes(audio)
    async def convert(request, data):
        assert data.format == "original"
        assert data.authorized
        return main.TemporaryAudioResponse(str(directory), directory / "audio.webm")
    monkeypatch.setattr(main, "create_download", convert)
    with TestClient(main.app) as client:
        result = client.post("/api/downloads", json={"url": "https://example.com/a", "format": "original", "authorized": True})
        assert result.status_code == 202
        job_id = result.json()["id"]
        assert wait_ready(client, job_id)["extension"] == "webm"
        response = client.get(f"/api/downloads/{job_id}/file")
        assert response.content == audio
        assert response.headers["content-type"] == "audio/webm"
        assert '.webm' in response.headers["content-disposition"]
        assert not directory.exists()


def test_original_still_requires_authorization():
    with TestClient(main.app) as client:
        assert client.post("/api/downloads", json={"url": "https://example.com/a", "format": "original"}).status_code == 403
