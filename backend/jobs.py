"""Ephemeral conversion jobs. A native file request starts only after conversion."""
import asyncio
import shutil
import time
import uuid
from dataclasses import dataclass
from typing import Awaitable, Callable, Any

from fastapi import HTTPException


@dataclass
class Job:
    id: str
    created_at: float
    status: str = "preparing"
    response: Any = None
    detail: str | None = None
    task: asyncio.Task | None = None
    progress: dict | None = None


class JobStore:
    ttl_seconds = 600
    max_jobs = 32

    def __init__(self):
        self.jobs: dict[str, Job] = {}

    def start(self, convert: Callable[[], Awaitable[Any]]) -> Job:
        if len(self.jobs) >= self.max_jobs:
            raise HTTPException(429, "Download queue is full. Try again shortly.")
        job = Job(uuid.uuid4().hex, time.monotonic())
        self.jobs[job.id] = job
        job.task = asyncio.create_task(self._run(job, convert))
        return job

    async def _run(self, job, convert):
        try:
            job.response = await convert()
            job.status = "ready"
        except asyncio.CancelledError:
            raise
        except HTTPException as error:
            job.status = "failed"
            job.detail = error.detail
        except Exception:
            job.status = "failed"
            job.detail = "Conversion failed. Check the backend and try again."

    def get(self, job_id: str) -> Job:
        job = self.jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Download expired or was cancelled. Please retry.")
        return job

    def take_file(self, job_id: str):
        job = self.get(job_id)
        if job.status != "ready":
            raise HTTPException(409, "Audio is not ready to download.")
        self.jobs.pop(job_id)
        return job.response

    async def remove(self, job_id: str):
        job = self.jobs.pop(job_id, None)
        if job is None:
            return
        if job.task and not job.task.done():
            job.task.cancel()
            await asyncio.gather(job.task, return_exceptions=True)
        if job.response:
            shutil.rmtree(job.response.directory, ignore_errors=True)

    async def expire(self):
        for job_id, job in list(self.jobs.items()):
            if time.monotonic() - job.created_at > self.ttl_seconds:
                await self.remove(job_id)

    async def sweep(self):
        while True:
            await asyncio.sleep(30)
            await self.expire()

    async def close(self):
        for job_id in list(self.jobs):
            await self.remove(job_id)
