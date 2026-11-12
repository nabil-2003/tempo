from __future__ import annotations
import asyncio
import json
import os
import signal
import shutil
import sys
import tempfile
from contextlib import asynccontextmanager
from jobs import JobStore
from audio_formats import AUDIO_MIME_TYPES
from pathlib import Path
from typing import Annotated
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse
from models import DownloadRequest, MediaResult, MAX_QUERY_LENGTH, MAX_URL_LENGTH
from extractor import extract_info, to_result, validate_source_url, extract_playlist, search_playlists

jobs = JobStore()

@asynccontextmanager
async def lifespan(app):
    sweeper = asyncio.create_task(jobs.sweep())
    try:
        yield
    finally:
        sweeper.cancel()
        await asyncio.gather(sweeper, return_exceptions=True)
        await jobs.close()

app = FastAPI(title="Tempo media backend", version="2.1.0", lifespan=lifespan)
conversion_slots = asyncio.Semaphore(2)

class TemporaryAudioResponse(FileResponse):
    def __init__(self, directory: str, path: Path | None = None):
        self.directory = directory
        path = path or Path(directory) / "audio.mp3"
        self.extension = path.suffix[1:]
        super().__init__(path, media_type=AUDIO_MIME_TYPES[self.extension], filename=f"tempo-audio.{self.extension}")

    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            shutil.rmtree(self.directory, ignore_errors=True)


@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/api/search", response_model=list[MediaResult])
async def search(query: Annotated[str, Query(min_length=1, max_length=MAX_QUERY_LENGTH)]):
    value = query.strip()
    if not value:
        raise HTTPException(400, "Enter a search query or media URL.")
    source = await asyncio.to_thread(validate_source_url, value) if "://" in value else f"ytsearch10:{value}"
    results = await asyncio.to_thread(extract_info, source)
    entries = results.get("entries") if results.get("_type") == "playlist" else [results]
    return [to_result(entry) for entry in (entries or []) if isinstance(entry, dict)]

@app.get("/api/media", response_model=MediaResult)
async def media_info(url: Annotated[str, Query(max_length=MAX_URL_LENGTH)]):
    source = await asyncio.to_thread(validate_source_url, url)
    return to_result(await asyncio.to_thread(extract_info, source))

@app.get("/api/playlists/search")
async def playlist_search(query: Annotated[str, Query(min_length=1, max_length=MAX_QUERY_LENGTH)]):
    return await asyncio.to_thread(search_playlists, query.strip())

@app.get("/api/playlist")
async def playlist_info(url: Annotated[str, Query(max_length=MAX_URL_LENGTH)]):
    source = await asyncio.to_thread(validate_source_url, url)
    return await asyncio.to_thread(extract_playlist, source)

async def create_download(request: Request, data: DownloadRequest):
    if not data.authorized:
        raise HTTPException(403, "Confirm that you own or are authorized to save this media.")
    if data.format not in {"mp3", "original"}:
        raise HTTPException(400, "Choose MP3 or original audio output.")
    source = await asyncio.to_thread(validate_source_url, data.url)
    directory = tempfile.mkdtemp(prefix="tempo-download-")
    process = None
    try:
        async with conversion_slots:
            process = await asyncio.create_subprocess_exec(
                sys.executable, str(Path(__file__).with_name("worker.py")),
                source, directory, str(data.quality), data.format, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL, start_new_session=True,
            )
            result = asyncio.create_task(process.communicate())
            try:
                async with asyncio.timeout(300):
                    while not result.done():
                        if await request.is_disconnected():
                            raise HTTPException(499, "Download cancelled.")
                        if hasattr(request, "on_progress"):
                            try:
                                request.on_progress(json.loads((Path(directory) / "progress.json").read_text()))
                            except (OSError, ValueError):
                                pass
                        await asyncio.wait({result}, timeout=0.25)
                    stdout, _ = await result
            finally:
                if process.returncode is None:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    await process.wait()
                if not result.done():
                    await result
            if process.returncode:
                try:
                    error = json.loads(stdout.decode().strip().splitlines()[-1])
                except (ValueError, IndexError):
                    error = {"status": 422, "detail": "Source unavailable or conversion failed."}
                raise HTTPException(error["status"], error["detail"])
        output = Path(directory) / "audio.mp3"
        if data.format == "original":
            outputs = [path for path in Path(directory).glob("audio.*") if path.suffix[1:] in AUDIO_MIME_TYPES]
            if len(outputs) != 1:
                raise HTTPException(422, "The original audio format is unsupported.")
            output = outputs[0]
        return TemporaryAudioResponse(directory, output)
    except TimeoutError:
        shutil.rmtree(directory, ignore_errors=True)
        raise HTTPException(504, "Conversion timed out. Try a shorter recording.")
    except BaseException:
        shutil.rmtree(directory, ignore_errors=True)
        raise

@app.post("/api/download")
async def download(request: Request, data: DownloadRequest):
    return await create_download(request, data)

@app.get("/api/download")
async def download_get(request: Request, url: Annotated[str, Query(min_length=1, max_length=MAX_URL_LENGTH)], format: str = "mp3",
                       authorized: bool = False, quality: Annotated[int, Query(ge=128, le=320)] = 192):
    if quality not in {128, 192, 320}:
        raise HTTPException(400, "Choose 128, 192, or 320 kbps.")
    return await create_download(request, DownloadRequest(url=url, format=format, authorized=authorized, quality=quality))


class JobRequest:
    # Job lifetime is managed by DELETE/expiry/shutdown, not the short POST connection.
    async def is_disconnected(self):
        return False


@app.post("/api/downloads", status_code=202)
async def start_download(data: DownloadRequest):
    if not data.authorized:
        raise HTTPException(403, "Confirm that you own or are authorized to save this media.")
    if data.format not in {"mp3", "original"}:
        raise HTTPException(400, "Choose MP3 or original audio output.")
    request = JobRequest()
    job = jobs.start(lambda: create_download(request, data))
    request.on_progress = lambda progress: setattr(job, "progress", progress)
    return {"id": job.id, "status": job.status}


@app.get("/api/downloads/{job_id}")
async def download_status(job_id: str):
    job = jobs.get(job_id)
    return {"id": job.id, "status": job.status, "detail": job.detail,
            "extension": job.response.extension if job.response else None, "progress": job.progress}


@app.get("/api/downloads/{job_id}/file")
async def download_file(job_id: str):
    return jobs.take_file(job_id)


@app.delete("/api/downloads/{job_id}", status_code=204)
async def cancel_download_job(job_id: str):
    await jobs.remove(job_id)
