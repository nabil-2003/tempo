# Tempo test log

## Phone release build (Nov 12)

- User authorized build, new public GitHub repository, source push and APK release.
- Standalone ARM64 assembleRelease PASS in11m3s,822 tasks. Native engine Kotlin
  compilation now includes playlist name search/resolution and real progress.
- Output builds/Tempo-1.0.0-arm64-v8a.apk,80.27MiB. SHA256 in builds/SHA256SUMS.txt.
- ZIP CRC, ARM64-only libraries, bundled JS, pinned extractor hash, native Python
  and FFmpeg libraries, and APK v2 signature verification PASS.
- 27 frontend tests,54 Python tests, TypeScript and Expo lint PASS before build.
- Emulator/preview servers closed for memory; no app data cleared. Physical-phone
  playback, native media controls, cold splash and offline playlist tests remain
  for user. Emulator audible stutter remains unconfirmed.
- GitHub authorization succeeded; public nabil-2003/tempo repository created.
  Source/release publication in progress.


## Latest: playlist name search and Expo Go service error

- 27/27 frontend tests and 54/54 Python tests pass; TypeScript and Expo lint pass.
- Real metadata search for “Raja music” returned ten actual playlists through
  yt-dlp without keys/login or media downloads. Flat search does not resolve
  playlist tracks; canonical source selection is preserved through quality and
  authorization. Mocked service tests reject non-playlist/duplicate results and
  invalid name input.
- Android package inspection shows Expo Go is the current runtime and Tempo's
  custom package is absent. Logcat explicitly reports Expo Go's
  AudioControlsService is not found. Go runtime guard now avoids requesting the
  unavailable service; custom-build configuration remains enabled.
- Bridge regression checks foreground playback with service controls disabled,
  no second zero-position seek, unchanged repeat/volume not rewritten, and no
  seek/rebuild during metadata refresh. Existing custom media-control tests pass.
- Native media state showed normal1× playback progressing continuously; mixer
  counters reported zero underruns. Emulator timing stalls and nearly full host
  swap were observed. Audible stutter is not marked fixed without a new listening
  check. No native build, uninstall, data clear, or device navigation performed.


## Current update (Nov 12): playlist/progress/branding live preview

- 24 frontend service tests pass, including shared queue deduplication, partial
  success, group retry, source-order reconciliation, persisted batches,
  interrupted-job restoration, pending cancellation, and decode-failure cleanup.
- 49 backend tests include real yt-dlp extraction of our own generated HTML audio
  playlist and real FFmpeg MP3 conversion/ffprobe duration verification. No
  third-party audio was downloaded for these tests. Production URL validation
  remains enabled; private test fixtures are used only through direct services.
- Python progress hooks/atomic reporting/status polling and unavailable/oversized
  playlist errors are tested. Existing download/cancellation/security regressions
  remain in the suite.
- TypeScript/Expo lint pass; final rerun recorded below. Metro Android bundle
  compiles. Local health endpoint responds on8000; live preview uses this Python
  server explicitly while current native APK remains installed.
- Original Tempo SVG/PNG assets visually inspected and public Expo config resolves
  their paths. No additional native prebuild/APK build performed before user
  approval. Current installed native splash therefore still reflects the old
  binary. Release cold-launch/launcher and latest Kotlin adapter compilation are
  pending the approved build.
- Emulator left available to user; a read-only screenshot showed Android Home.
  No current-update background/notification/lock/offline/device playlist matrix
  is claimed as passed. These checks remain for a dedicated device window.

Earlier entries below are historical evidence, not current certification.


Tests below distinguish service tests with mocked native APIs from actual device
execution. Unit passes do not certify Android functionality.

1. Startup baseline: emulator-5554 connected; Expo Go launch intent succeeded.
   New V1 startup/render verification pending after dependency alignment.
2. Local storage: service tests pass for directories, concurrent writes, restart,
   corruption preservation, backup recovery and missing-file metadata retention.
3. Import: service test passes for duplicate content, native-duration result,
   metadata propagation and player cleanup. Device file picker pending.
4. Playback: store tests pass for real local queue, restore, repeat modes, missing
   IDs and empty library. Audio output/seek/repeat on Android pending.
5. Downloads: cancellation/retry/duplicate and preparation tests pass. Direct MP3
   device download pending. Native video extraction blocked: no integration exists.
6. Library: favorites/deletion persistence service tests pass; UI pending.
7. Playlists: serialized create/rename/add/delete and restart service test passes.
   Device operations and reorder pending.
8. Home: code now derives sections from actual metadata; device pending.
9. Offline: not yet executed on device.
10. Persistence: service restart tests pass; Android force-close/reopen pending.
11. Errors: service tests cover corrupt JSON, missing files, insufficient storage,
    cancellation, duplicate media and backend failures. Device cases pending.
12. APK preflight: `./gradlew assembleDebug` failed with CXX1101 because the NDK
    directory contained only `.installer`. Preserved that incomplete installation
    under `27.1.12297006.incomplete-tempo-backup`; retry after SDK alignment.

Quality checks: first typecheck found nullable currentTrack use (fixed). Lint
found writable native volume flagged as immutable hook value; documented the
native setter and scoped the lint exception. Expo Doctor found missing expo-asset
and SDK patch mismatches; SDK-compatible installation/repair in progress.

Current service suite: 15 tests passed. Existing optional backend suite remains
available and will be rerun separately. No unexecuted device test is marked pass.

## Executed V1 emulator checks (Nov 12)

- Clean Expo Go launch on Pixel 9, Metro 8082: bundled successfully and rendered
  real Home, Library and Downloads. No blocking ReactNativeJS/AndroidRuntime errors.
- Existing real song files and saved playlist remained visible. No real songs
  were deleted or replaced. Home showed real history, Library showed actual count
  and usage, and Profile is not exposed in V1 navigation.
- Force-stopped Expo Go without clearing data and reopened V1: real library,
  playlist and current track restored; playback was paused. This verifies observed
  persistence, not all playback controls.
- Import button launched the native Android document picker. Completing selection
  is pending: another app/session appears to be changing screens during test
  actions; requested an uninterrupted emulator window. Native import is not yet
  marked pass.
- Expo Doctor rerun: 20/20 pass. TypeScript and lint pass after SDK repair.
- Preserved optional backend regression suite: 39 pass.

## Updated Downloads requirements

- Name search rejects URL entry and selects the embedded service first: service
  regression test passes. Native module startup is cached, with retry after a
  failed initialization: service test passes.
- Quality selection moved into a modal opened by Download; permission to save
  media is confirmed after selecting quality. Native UI verification pending.
- Local Expo module and Android runtime dependencies added. Autolinking resolve
  confirms tempo-engine is discovered. Kotlin compilation and on-device execution
  are NOT yet verified: the required NDK installation remains incomplete.
- Runtime import still fails on Expo Go with FileSystem READ error. Both
  DocumentPicker and built-in FileSystem picker were tested; neither successful
  import nor permission recovery is claimed. Custom APK permission behavior still
  needs verification. Existing music has not been deleted.
- TypeScript/lint pass; 17 frontend tests pass. Existing Python suite has 39
  passing tests from the preceding V1 verification.
- Live development-fallback search for “Raja music” returned HTTP 200 with ten
  actual results after lightweight metadata extraction was enabled.
- Pixel 9 UI: tapping the real search-result Download icon opened the quality
  sheet with Original, Low (128 kbps), Medium (192 kbps), High (320 kbps), size
  estimates and Cancel. This interaction is device-verified; the bundled native
  engine remains unverified until the APK build succeeds.

## Latest executed checks

- **17/17 frontend service tests pass**, TypeScript and Expo lint pass.
- **40/40 Python tests pass**, including actual FFmpeg conversion and worker-path
  original-byte preservation with generated owned audio, and the Android zipapp
  digest/version/EJS checks without site-packages. One upstream Starlette/AnyIO
  deprecation warning remains; no test failure.
- Expo Doctor rerun after native module addition: **20/20 checks pass**.
- Native HTTP server Kotlin compiled against actual Android 37, published
  youtubedl-android classes and NanoHTTPD. This check excludes the Expo module
  wrapper/native packaging and does not replace a complete APK build.
- The bundled Android extractor has verified Python 3.12 compatibility and is
  pinned to yt-dlp 2026.10.26 + yt-dlp-ejs 0.8.0; deterministic asset committed.
- Latest Pixel 9 import test SUCCESS: Android system picker selected generated
  tempo-owned-a.mp3, Library changed from two to three songs, displaying real
  title/artist/album from its ID3 tag. Current built-in FileSystem picker works;
  earlier READ errors with previous picker/bundles are retained above as history.
- Generated MP3 full-player test: duration **0:25**, paused at **0:04**, +10s
  changed position to **0:14**, Play resumed to **0:15** with native progress,
  then Pause succeeded. Mini and full player showed the same fixture metadata.
- Quality sheet selection opened the separate authorization alert with Cancel
  and Download. Agent canceled; no third-party media intentionally downloaded.
- Full APK build remains pending installation of the incomplete Android NDK;
  archive download continues with preserved, resumable ranges. No successful APK
  artifact/install/native extraction test is claimed yet.
- Offline playback SUCCESS on Pixel 9: disabled both Wi-Fi and mobile data,
  played the generated local recording, observed advancing 0:05/0:25 native
  playback and Pause control, paused it, and restored both original radio settings.
  An earlier harness attempt stopped at a screen-precondition mismatch and
  restored the radios; the repeat explicitly opened the fixture player first.

## Resumed native build verification

- Host restarts removed the old `/tmp` download/processes. Re-downloaded the exact
  official NDK with persistent cache, checked all archive CRCs and installed
  revision 27.1.12297006, preserving the incomplete SDK directory.
- Backed up Pixel 9's current userdata/encryption images under ignored
  `.build-cache/pixel9-before-native-tests` before booting without snapshot loading.
- Re-ran frontend tests (17 pass), backend/bundle tests (40 pass), TypeScript and
  lint (pass).
- Full Gradle build compiled `tempo-engine` and app Kotlin successfully. The host
  restarted again during C++ compilation; resumed with one Gradle worker, a 1GiB
  heap, in-process Kotlin and Ninja compile/link pools capped at one. Worklets
  x86_64 now compiled; remaining native build/runtime tests are still pending.
- Selected native-download test source: official Blender channel video
  https://www.youtube.com/watch?v=aqz-KE-bpKQ, “Big Buck Bunny 60fps 4K - Official
  Blender Foundation Short Film”. Current extracted metadata explicitly reports
  Creative Commons Attribution (reuse allowed), public availability, age limit0.
  Project license: https://peach.blender.org/about/ . Attribution: ©2008 Blender
  Foundation / www.bigbuckbunny.org; music/sound Jan Morgenstern. This identifies
  the authorized test source; no completed native download is claimed yet.

## Manual release export correction

User's manual build failed in createBundleReleaseJsAndAssets while Expo Router
crawled layouts for an embedded Node/web server manifest. Changed app.json
web.output from server to single: there are no Expo +api routes in this mobile
app. Verified the installed SDK58 isApiRoutesEnabled config gate is false with
the resolved configuration. Full APK rebuild is intentionally left to the user;
no release-build pass is claimed from this configuration check.

## Manual release Android lint correction

The next manual build reached lintVitalRelease and reported missing
includeSubdomains on loopback domain elements. Added explicit false to main/debug
XML and the config plugin template. Verified XML parsing and exact host lists,
plugin-generated output matching both resources, plugin syntax, TypeScript,
Expo lint and whitespace checks. Gradle lint/assemble was not rerun automatically;
the user retains manual control and existing compiled outputs.

## First standalone APK build success (user-executed)

User's manual assembleRelease completed successfully in1m58s (891tasks), including
Android JS/asset bundling. Release artifact: android/app/build/outputs/apk/release/app-release.apk.
The build result is verified from the user's terminal output and artifact path;
installation and embedded Python/FFmpeg runtime behavior remain pending manual
device testing. No Gradle/Metro/emulator process was started for this update.

Final live-preview checks:24/24 frontend tests,49/49 backend tests, TypeScript,
Expo lint and git diff --check all pass. Four configured1024px PNG assets decode
successfully. Existing native binary retained; no new APK build before approval.
