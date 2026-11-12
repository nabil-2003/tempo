# Tempo local media backend

Run from this directory after installing FFmpeg and Python dependencies (see
[project setup](../README.md)):

```bash
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn main:app --host 0.0.0.0 --port 8000
pytest
```

- `GET /health`
- `GET /api/search?query=...`: YouTube text search without a Data API key; URL input
  also supported. Other yt-dlp sources are available through URL lookup.
- `GET /api/media?url=...`: metadata, thumbnail, duration, technical availability
  and source audio formats. `downloadable` is not a permission/license assertion.
- `GET /api/playlists/search?query=...`: playlist name search without keys or login;
  returns at most ten canonical playlist cards without expanding their tracks.
- `GET /api/playlist?url=...`: bounded public playlist resolution (up to 500 tracks),
  preserving order and unavailable entries. Does not download or assert permission.
- `POST /api/downloads`: same authorized JSON body as below; returns HTTP 202
  with a job `id` immediately. This is the app's preferred conversion flow.
- `GET /api/downloads/{id}`: `preparing`, `ready`, or `failed` with an error `detail`.
  Includes `progress: { phase, percent, bytes, total, estimated }` where available.
  Source byte totals come from yt-dlp hooks; unknown totals/conversion have null
  percentages and must be shown as indeterminate. Transfer totals use Content-Length.
- `GET /api/downloads/{id}/file`: stream the ready audio, then remove its job/files.
- `DELETE /api/downloads/{id}`: cancel conversion or remove an unclaimed file.
- `GET /api/download?url=...&format=mp3&quality=192&authorized=true`
- `POST /api/download`: JSON `{ "url": "...", "format": "mp3",
  "quality": 192, "authorized": true }`. Allowed MP3 output bitrates: 128/192/320.
  Use `"format": "original"` to keep the best audio-only stream without re-encoding;
  bitrate is ignored in this mode. Original also requires authorization.

`extractor.py` owns yt-dlp metadata and validation; `converter.py` owns MP3
conversion and original audio downloads. `worker.py` isolates downloads/FFmpeg in a process group. Two
conversions may run concurrently, with a five-minute conversion deadline.
For the legacy endpoints, disconnects kill the worker/FFmpeg group.
For jobs, DELETE cancels conversion; short polling connections do not cancel it. Converted files are temporary and
removed on errors or after streaming, including interrupted response sends.
Responses include Content-Length for app transfer progress. No permanent media
library is stored on the backend. Unclaimed/abandoned jobs expire after ten
minutes and are swept every 30 seconds. Shutdown also cancels jobs and deletes
ready files. At most 32 jobs are retained. Jobs live in memory: use the default
single Uvicorn worker, and retry after a backend restart. Preparation failures
are returned in job status, so the app can show the actual backend error.

The app waits for readiness before calling the native file downloader; Android's
HTTP read timeout is therefore not spent waiting for extraction or FFmpeg.

Errors use FastAPI's `detail` field: 400 invalid source/output, 403 permission
confirmation missing, 422 unavailable/unsupported/restricted/protected source,
503 missing FFmpeg/ffprobe, 504 conversion deadline. yt-dlp does not accept login,
cookies, custom proxy parameters or DRM overrides from clients. Individual jobs reject playlists and live streams. Resolve playlists first, then
enqueue each authorized track as an independent job. A failed track never removes
other successful downloads.

This is a local development service, without authentication or public deployment
hardening. Initial source URLs reject credentials, private DNS destinations and
custom ports. This check is not a full network isolation mechanism: extractor
subrequests/redirects and DNS changes require an outbound firewall before any
public deployment. Do not expose this development server to the internet.

Useful upstream references:
- https://github.com/yt-dlp/yt-dlp#embedding-yt-dlp
- https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/
- https://docs.expo.dev/versions/v58.0.0/sdk/audio/

Original mode uses `bestaudio` without postprocessors/fixups or a video fallback.
Supported source extensions are MP3, M4A, WebM, Opus, Ogg, FLAC, WAV, AAC; unsupported
containers produce an error rather than a lossy conversion. Ready job status
includes `extension`; file responses use the matching MIME type and filename.
Restart the backend when updating the app so the new status contract is available.
