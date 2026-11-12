# Tempo embedded engine (Android)

This local Expo module bundles the Android Python/yt-dlp runtime and companion
FFmpeg native binaries from youtubedl-android 0.18.1. The HTTP adapter is Kotlin
(NanoHTTPD 2.3.1), not a separate FastAPI process. No Python installation, external
server, platform API key or account is required by the installed custom APK.

The service starts lazily on name search, binds a random port on 127.0.0.1 and
requires an unguessable session path returned through the native module. It
supports the existing search/download-job/status/file/delete protocol. Search
is ytsearch10 by song/artist name; downloads only accept canonical YouTube result
URLs. Permission to download is separately confirmed before a job is accepted.
Cookies, login credentials, custom extractor commands and DRM overrides are not
accepted. Restricted/unavailable media remains an error.

Two downloads may prepare concurrently; jobs expire after ten minutes. Original
keeps the accessible audio-only stream. Low/Medium/High use 128/192/320 kbps MP3
conversion through the bundled FFmpeg. Native cancellation, ABI compatibility,
search and conversion must be tested on the built APK; TypeScript tests alone
cannot establish native compatibility.

Expo Go cannot load this module. Build with `npx expo run:android` or
`cd android && ./gradlew assembleDebug`. A standalone local-test APK requires
`./gradlew assembleRelease` (the project's current release signing configuration
uses the debug key; this is not a store-distribution signing configuration).

`plugins/withTempoEngine.js` preserves native-library extraction, arm64-v8a /
x86_64 ABIs and loopback cleartext networking during future Expo prebuilds. The
native project already exists, so the same settings were applied there directly.
Do not run prebuild --clean over existing native work.

Permissions: INTERNET is a normal install-time permission. Tempo's private song
storage does not need a runtime permission. Android's system file picker asks
which documents may be imported; it grants read access only to selected files.
No microphone or broad shared-storage permission is requested for downloading.

Upstream implementation/docs:
- https://github.com/yausername/youtubedl-android
- https://github.com/NanoHttpd/nanohttpd
- https://docs.expo.dev/modules/get-started/

## Reproducing the Python asset

The runtime's packaged Python is 3.12. Tempo installs the committed, pure-Python
zipapp `android/src/main/assets/tempo-ytdlp` over the runtime's older extractor at
startup, using a SHA256 version stamp and an atomic rename. The zipapp includes
yt-dlp **2026.10.26**, **yt-dlp-ejs 0.8.0** solver data and their distribution
metadata/licenses. The native runtime supplies QuickJS. No server-side Python
installation or remote runtime update is used by the APK.

From the repository root:

```bash
backend/.venv/bin/python -m pip install yt-dlp==2026.10.26 yt-dlp-ejs==0.8.0
backend/.venv/bin/python scripts/bundle-android-python.py
backend/.venv/bin/python -m pytest -c backend/pytest.ini backend/test_android_bundle.py -q
```

The bundler validates package versions, sorts files and fixes ZIP timestamps to
produce reproducible output. The regression test checks the digest, ZIP CRC,
extractor version and EJS import with Python site-packages disabled. This verifies
the asset, not Android process execution; the latter requires the APK test.

Playlist/progress update (requires a rebuilt APK): GET `/api/playlist?url=...`
accepts public HTTPS YouTube playlist links, normalizes the playlist ID, resolves
up to 500 entries with the bundled extractor and preserves unavailable entries.
Each accessible track goes through the existing separately authorized download
job; playlists themselves are never passed to a single-track job. No cookies,
login, geographic spoofing or restricted-content bypass is added.

Job status now includes `progress.phase` and `progress.percent` from the native
library's real yt-dlp download callback. Extracting/converting are indeterminate;
frontend file transfer measures bytes independently. Current installed older
binaries do not acquire these endpoints through Metro. For live preview without
building, set `EXPO_PUBLIC_DOWNLOAD_ENGINE=server` and run the Python backend.
Latest native adapter compilation/device checks are pending user build approval.

Playlist name search: GET `/api/playlists/search?query=...` now uses the bundled
yt-dlp search-URL extractor with YouTube's public playlist filter, flat extraction
and a ten-result limit. It returns the same title/curator/artwork/source/count
contract as the Python server. Tracks are resolved only on selection. This native
source change also requires the later approved APK rebuild.
