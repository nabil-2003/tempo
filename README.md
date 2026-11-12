# Tempo

<p align="center"><img src="assets/images/tempo-icon.png" alt="Tempo music note icon" width="112" /></p>

A purple-themed Android music app built with Expo / React Native. Search for
songs and playlists by name, save authorized audio, and build a personal offline
library—without YouTube Data API keys, Google Cloud credentials, or media-service
login.

Tempo's custom Android APK runs its download engine **on the phone**, using
bundled Python, yt-dlp and FFmpeg. The optional Python/FastAPI desktop backend is
for development; it is not required by the standalone APK.

## Features

- Song and playlist name search, with titles, artwork and artist/curator details.
- Original audio without re-encoding, or Low / Medium / High MP3 presets.
- Playlist downloads with source order, duplicate skipping and partial success.
- Individual/group retries, cancellation, measured download/transfer progress,
  and indeterminate conversion/verification indicators.
- Offline playback, seeking, next/previous, favorites, shuffle/repeat and artwork.
- Shared native playback queue and Android background/notification/lock-screen
  controls in the custom build.
- MP3 import through Android's file picker, persistent library and song deletion.
- Original Tempo launcher/adaptive/monochrome icon and native splash artwork.

Only download media you own, are licensed to download, or are otherwise authorized
to save. Public accessibility and search results **do not grant permission**.
Tempo does not use cookies/login, DRM circumvention, geographic spoofing or
access-control bypasses. Restricted, unavailable and unsupported media return
errors. Source services can change, so extraction availability is not guaranteed.

## Install the phone APK

[Download APK](https://github.com/nabil-2003/tempo/releases/latest/download/Tempo-1.0.0-arm64-v8a.apk) · [Release notes and checksums](https://github.com/nabil-2003/tempo/releases)

Open this repository's **Releases** page and download the ARM64 APK and
`SHA256SUMS.txt`. Open the APK on your Android phone; allow installation from that
browser/file manager if Android requests it. The standalone app needs neither
Expo Go nor Metro nor a desktop server. Internet is required to search/download;
saved tracks and playlists play offline.

With a USB-connected phone and USB debugging enabled:

```bash
adb devices
adb install -r builds/Tempo-1.0.0-arm64-v8a.apk
adb shell am start -n com.nabil.tempo/.MainActivity
```

The phone-testing APK targets `arm64-v8a` and uses local debug signing. It is not a
Play Store distribution build. Updating a compatible Tempo installation with
`adb install -r` preserves its library. Expo Go uses a separate app sandbox; its
saved music is not automatically migrated. Uninstalling/clearing app data removes
Tempo's private files.

## Development setup

Dependencies: Node.js **22.13 or newer**, npm, Python 3.12+ and FFmpeg/ffprobe.
Native Android builds also require JDK 21, Android SDK 37 / Build Tools 37,
NDK 27.1.12297006 and adb. The current stack is Expo 58 / React Native 0.88 /
React 19.3, Expo Router, expo-audio, expo-file-system, Zustand and Ionicons.

```bash
npm ci
sudo apt install python3-venv ffmpeg
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
```

Start the optional backend in one terminal:

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

Start the frontend in another terminal (Pixel emulator):

```bash
EXPO_PUBLIC_DOWNLOAD_ENGINE=server EXPO_PUBLIC_BACKEND_URL=http://10.0.2.2:8000 \
  npx expo start --go --port 8081 --max-workers 1
```

Use `--dev-client` instead of `--go` for a custom development APK. To use the
bundled engine, omit the server override. For a USB phone, run
`adb reverse tcp:8081 tcp:8081` and `adb reverse tcp:8000 tcp:8000`, use backend URL
`http://127.0.0.1:8000`, and connect the development client to
`http://127.0.0.1:8081`. Restart Metro after environment changes. See
[.env.example](.env.example).

**Expo Go cannot include the bundled Python engine or Tempo's Android foreground
media service.** It supports foreground preview with the optional backend; the
app detects Go and skips unsupported background/lock-screen calls. Full native
controls and launcher/splash changes require a custom build.

## Build locally

Close the emulator during compilation on memory-constrained machines. This
helper synchronizes native configuration **without cleaning**, limits Gradle /
CMake / Metro workers, disables R8 for the local testing APK, and explicitly
selects the bundled downloader so development server settings are not packaged.

```bash
bash scripts/build-phone-apk.sh
```

Output: `builds/Tempo-1.0.0-arm64-v8a.apk` and `builds/SHA256SUMS.txt`.
Generated `android/`, APKs, credentials, caches and virtual environments are not
tracked. Native behavior is represented by `app.json`, config plugins and the
local Expo module. Expo 58 prebuild defaults to cleaning; use explicit
`--no-clean --no-install` when preserving existing native outputs.

For an emulator development APK after syncing configuration, substitute
`:app:assembleDebug` and `-PreactNativeArchitectures=x86_64` in the helper's Gradle
command, install `android/app/build/outputs/apk/debug/app-debug.apk`, then start
Metro with `--dev-client`.

## Download quality and storage

| Choice | Output |
|---|---|
| Original | Best available audio-only stream; original supported container |
| Low | MP3, 128 kbps |
| Medium | MP3, 192 kbps |
| High | MP3, 320 kbps |

Higher MP3 bitrate cannot restore detail missing from the source, and does not
fix playback stutters. Original preserves the available source stream, not an
unavailable studio master. Original codec support depends on the device.

Every song has a unique ID. Downloads use temporary files; completed audio is
validated by the native decoder and saved before appearing as complete. Artwork
failure does not discard audio. The backend stores files only temporarily.

```text
Tempo/
├── musics/<song-id>.<audio-extension>
├── thumbnails/<song-id>.jpg
└── data/
    ├── songs.json
    ├── playlists.json
    ├── downloads.json
    └── playback.json
```

Metadata writes are serialized, backed up, and preserve corrupt data for explicit
recovery. Interrupted jobs restore as retryable failures. Queue/position restore
paused. Active downloads require the app process to remain alive; durable
background download resume is not implemented.

Private app storage needs no broad storage permission. MP3 import opens Android's
file picker for selected-file access. Microphone and broad storage permissions
are disabled. INTERNET is granted at installation; no media account is required.

## Checks and current limits

```bash
npm run lint
npm run typecheck
npm test
backend/.venv/bin/python -m pytest -q
```

Current suites include 27 frontend service tests and 54 Python tests. Real
integration tests use our generated audio for yt-dlp extraction and FFmpeg
conversion. Native queue tests mock platform APIs and do not certify physical
phone behavior. Full background/media-control, offline playlist and cold-launch
checks still need the phone test. A small audible stutter reported on the emulator
remains under investigation; no source-quality defect or audible fix is claimed.

The bundled extractor is pinned to yt-dlp 2026.10.26 + yt-dlp-ejs 0.8.0; native
runtime/FFmpeg dependencies use youtubedl-android 0.18.1. No automatic remote code
update is enabled. See [engine documentation](modules/tempo-engine/README.md),
[backend endpoints](backend/README.md), [test log](TEST_REPORT.md),
[feature status](V1_FEATURE_STATUS.md), and [work context](context.md).

Original artwork is reproducible from SVG with
`scripts/generate-brand.py` (asset tooling dependency: CairoSVG 2.9.1). The NDK
range-download helper is `scripts/download-android-ndk.py`. The extractor bundler
is `scripts/bundle-android-python.py`; changing it requires rebuilding the APK.
