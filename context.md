# Tempo implementation context

## Request and constraints
Implement API-key-free public-media discovery and authorized MP3 downloads through FastAPI, yt-dlp and FFmpeg. Never infer download permission from public access; no login, cookies, DRM or access-control bypass. Preserve existing UI and Tempo/{musics,thumbnails,data/songs.json}. Update this file as work progresses.

## Inspected baseline
- Expo SDK 58, npm/package-lock; existing routes in app/ (preserve current routing).
- Existing backend/main.py provides basic yt-dlp search/extraction/conversion and authorization confirmation.
- Existing Downloads UI, file storage and expo-audio integration are partial.
- No active YouTube Data API credential integration found.
- Problems: missing quality selection, broken retry due to stale queue closure, concurrent metadata writes, duplicate race, local songs absent from player navigation/favorites.
- Working tree already contains substantial user changes; preserve them.
- Read SDK 58 versioned filesystem/audio docs and Expo llms index before changing APIs.

## Progress
- Initial inspection complete. Implementation underway.

## Verification
Pending: backend tests, Expo lint, TypeScript, emulator manual verification.

- SDK 58 installed types confirm File.downloadFileAsync supports AbortSignal/progress; retained modern API. Modular backend extraction/conversion, cancellable subprocess conversion, quality output and frontend library integration implemented. Validation in progress.

## Completed implementation
- Backend services separated into models.py, extractor.py, converter.py and cancellable worker.py.
- No API keys/login/cookies; explicit authorization required on GET and POST downloads. Restricted/live/DRM/playlist downloads rejected.
- Search/URL metadata, audio formats, 128/192/320 kbps MP3 output and file streaming with Content-Length.
- Two conversion slots, five-minute deadline, disconnect kills process group, temporary file cleanup even if streaming fails.
- Downloads UI uses modular backend provider; source metadata and quality choices, authorization confirmation, preparation/transfer progress, cancel/retry and duplicate protection.
- Existing Tempo directories preserved. Serialized metadata writes; corrupt JSON preserved instead of overwritten; cached optional artwork.
- Downloaded songs support offline play, pause, touch seeking, local next/previous, persistent favorites and deletion. Existing demo screens retained.
- Added .env.example and root/backend setup documentation. No frontend dependency added.
- Fixed existing lint errors in template text and web hydration hook.

## Verified
- npx expo lint: passed.
- npx tsc --noEmit: passed.
- npm test: 4 frontend service tests passed (concurrent persistence, corruption, cancellation/retry/duplicates, offline queue).
- Python pytest: 28 passed, including actual yt-dlp + FFmpeg conversion of generated owned audio and cancellation cleanup. TestClient requires running outside this environment's sandbox (thread/event-loop restrictions); suite passes there. One upstream Starlette/AnyIO deprecation warning.
- Backend test dependency httpx installed into existing backend/.venv.

## Remaining manual checks / limitations
- Pixel 9 emulator UI/playback and real public-provider downloads have not been exercised. Use an authorized source and the README workflow.
- Active downloads do not resume after process termination; intended for foreground Expo Go use.
- Initial URL validation is not full SSRF isolation; backend is for local development, not public exposure without network isolation.
- Output bitrate cannot restore source quality. Provider changes or authentication requirements are reported as errors.

## Run session — 2026-11-11
- User requested running everything.
- Re-ran frontend tests (4 pass), TypeScript (pass), Expo lint (pass), backend tests (28 pass).
- Started FastAPI on 0.0.0.0:8000 and Expo Go/Metro on port 8081. Both health/status checks respond successfully.
- No Android device initially connected. Pixel_9 AVD exists; launching it next.
- Pixel_9 booted successfully. Installed Expo Go 58.0.5 opened exp://10.0.2.2:8081; Android bundle compiled successfully (1783 modules). Home screen visually verified; no ReactNativeJS/AndroidRuntime errors in startup logs.
- Servers and emulator left running for the user (FastAPI port 8000; Metro port 8081).
- Downloads tab renders. A live search for “raja” reached backend but failed with yt-dlp: “The page needs to be reloaded.” Installed extractor was 2025.1.15; upgrading before retrying. No bypass/cookies/login used.

- Updated yt-dlp to 2026.10.26 and raised the requirements minimum to match; restarted FastAPI (port 8000). Backend suite still passes all 28 tests with this version. Live search retry underway.

- Live search retry succeeded: HTTP 200, 10 results for “raja”. The outdated extractor caused the earlier failure. No media downloaded during the live search check.

## Expo restart request
- User requested stopping the existing Expo process occupying 8081.
- Verified PID 11903 was this project's Expo Go server and sent SIGTERM. Backend left running.
- User also requested stopping the backend. Identified Uvicorn PID 13084 listening on port 8000 and sent SIGTERM.

## Download timeout investigation
- User reported Android FileSystem.downloadFileAsync SocketTimeoutException during an authorized download.
- Current endpoint keeps the file request open throughout extraction/conversion, without response bytes until conversion ends. This can exceed the native HTTP read timeout.
- Implementing short-lived conversion jobs with status polling, followed by downloading only the completed MP3; preserve authorization, cancellation, cleanup and existing endpoints.

- Confirmed Android's installed FileSystem.downloadFileAsync uses a default OkHttp client while the old endpoint sends no bytes until conversion completes.
- Added ephemeral download jobs (POST create, GET status/file, DELETE cancel), capped at 32, with ten-minute expiry and shutdown cleanup. Original download endpoints retained.
- Frontend now polls bounded, short JSON requests before native MP3 transfer; surfaces conversion errors and cancels/removes jobs on failure. Authorization confirmation is unchanged.
- Checks so far: TypeScript and lint pass; 7 frontend tests and 34 backend tests pass, including slow-job readiness, cancellation, failure details and shutdown cleanup.
- Applying the fix requires restarting the existing Uvicorn process (it was started without --reload) and reloading the app. No server started or stopped during this fix.

- Final verification: 7 frontend service tests, 35 backend tests, TypeScript and Expo lint all pass. Added expiry cleanup coverage. Manual emulator retry of this fix has not been performed.

## Quality labels and size clarification
- User requested Low / Medium / High choices and mentioned “3mb”. Asked whether that means a roughly 3 MB file or original source quality; awaiting clarification for that part.
- Updated choices to Low (128), Medium (192), High (320 kbps), retaining the existing supported backend bitrates and default Medium.
- Display approximate decimal MB per choice using duration × kbps / 8000; sizes are estimates, not a fixed 3 MB guarantee. Show source-quality limitation in plain language.
- No codec or original-source download change made pending clarification.

- Quality-label change verification: Expo lint and TypeScript both pass. Backend unchanged; reload the app to see Low / Medium / High and estimated sizes.

## Original quality implementation
- User clarified “3mb” means keeping original source audio quality, not targeting a 3 MB file.
- Added Original as the default UI option; Low / Medium / High remain MP3 presets.
- Original uses yt-dlp bestaudio without postprocessors, re-encoding, video fallback, cookies or login. Unsupported original containers produce an error rather than silently transcoding.
- Jobs now advertise the actual extension; streamed MIME type, local file extension, signature validation and metadata match the source format. Existing MP3 library entries remain compatible.
- Original formats supported: MP3, M4A, WebM, Ogg/Opus, FLAC, WAV, AAC. Playback support depends on platform codecs (WebM/Opus especially on iOS); MP3 presets remain available for compatibility.
- Verification in progress, including byte-for-byte preservation of generated owned WAV audio through real yt-dlp.
- Initial verification passes: 9 frontend tests, 39 backend tests, TypeScript and Expo lint. Generated owned WAV is preserved byte-for-byte using real yt-dlp. Completing docs and worker-path coverage next.

- Final Original verification: 9 frontend tests and 39 backend tests pass, including real original WAV download and actual worker-process byte preservation; TypeScript and Expo lint pass. README/backend API docs updated. No live third-party media downloaded, and no manual device playback verification performed for the new Original option. Restart backend and reload Expo to apply.

## Tempo V1 expansion audit
- Read attached full V1 task and inspected package/config/router/screens/store/files/native Android project.
- No Chaquopy/native extractor exists. Current Expo Go workflow has optional Python-backend downloads; on-device direct MP3 workflow and import will be implemented without a server. Arbitrary video extraction/conversion remains a clearly reported native limitation.
- Prototype mock content remains across Home/Library/Search/Playlist/player initial state; Profile is deferred and will be inaccessible in V1 while its code is retained.
- Baseline emulator launch intent executed; real new V1 checks will be recorded sequentially in TEST_REPORT.md. Implementation underway.
- V1 implementation: real local Home/Library/Search/Playlist/player flows; mock song data and demo audio moved to tests/fixtures, Profile preserved in src/deferred with redirect route.
- Added document picker import, ID3 text/artwork parsing, content-hash deduplication, real duration probing, shared library refresh, storage usage/recovery/backup and queue persistence.
- Direct MP3 downloads now use FileSystem directly; optional backend remains available only when explicitly configured.
- 15 service tests pass; device verification pending. Expo Doctor peer/patch fixes running. Initial APK preflight blocked by incomplete NDK; preserved old incomplete directory rather than deleting it.

## Name search + embedded APK engine request (Nov 12)
- User steered V1 work: search by song/artist name instead of URL input, request needed permissions, show quality choice only after tapping Download, and bundle Python libraries with a small internal server.
- Added local Expo module modules/tempo-engine using youtubedl-android 0.18.1 (bundled Python/yt-dlp/JS runtime) and FFmpeg companion, plus tokenized loopback NanoHTTPD service. No Chaquopy duplicate runtime is needed; server adapter is Kotlin, extraction/conversion runs bundled Python/FFmpeg.
- Service binds only 127.0.0.1 on a random port with an unguessable session path. Supports name search, authorized conversion jobs, status polling, cancellation, expiry, and original/MP3 streaming. No login/cookies/DRM overrides.
- Name search now prefers the embedded service automatically; Expo Go reports that the custom APK is required (an explicitly configured desktop backend remains a development fallback).
- Download button now opens a quality sheet (Original/Low/Medium/High), then authorization confirmation. URL input removed from primary flow.
- INTERNET is install-time normal permission; private storage needs no runtime permission. Import uses Android's system picker grant, not broad storage or microphone access. Removed unneeded broad permissions.
- Previous V1 import device test failed on Expo Go FileSystem READ permission despite picker selection; investigation remains open, no successful device import claimed. Service import tests pass. Original data preserved.
- APK build still blocked by incomplete NDK 27.1.12297006. Prior Gradle download was interrupted with the turn; downloading official NDK to a resumable /tmp cache now. Must verify native compilation and runtime before claiming embedded engine works.
- Verified published Maven metadata: library and FFmpeg 0.18.1 artifacts exist; latest in this group is 0.18.1. Native module autolinks. Inspecting the bundled archive/runtime while NDK downloads; not yet compiled.
- Optimized desktop development fallback to flat name search; HTTP 200 / ten real results for Raja music. Pixel 9 confirmed Download opens the new Original/Low/Medium/High quality sheet. No automatic download from opening the sheet.
- Build prerequisites download is still in progress (~193 MB of the NDK archive at last check). Resumable downloader: /tmp/tempo-build-cache/download-ndk.py; waiting build/install pipeline: /tmp/tempo-build-cache/build-apk.sh. Incomplete NDK is preserved before replacement. No APK success claimed.
- Bundled reproducible yt-dlp 2026.10.26 + yt-dlp-ejs 0.8.0 zipapp asset (~3.1 MB) with SHA256 stamp. Published Android runtime launcher links Python 3.12, compatible with this extractor; isolated Python -S execution reports the pinned version and imports bundled EJS data.
- Compiled the actual Kotlin MediaServer against Android 37 android.jar, published youtubedl-android classes and NanoHTTPD. Server compilation passed; Expo-module/full APK runtime still pending NDK completion (~346 MB downloaded at this check).
- Pixel 9 import now SUCCESS with current built-in FileSystem picker: selected generated tempo-owned-a.mp3, returned to Library with “Tempo verification recording A”, ID3 artist/album and real count increment 2→3. Earlier READ errors occurred with prior picker/bundles; no broad permission added. Playback and duplicate verification continue.
- Current validation: 17 frontend tests, 40 backend/bundle tests, TypeScript, lint and Expo Doctor 20/20 all pass. Backend suite needs ordinary loopback/network-capable execution; sandboxed TestClient run stalled and was interrupted, rerun outside sandbox passed in 3.71 seconds.
- Pixel 9 actual generated-MP3 controls verified: 25-second duration, pause at 4s, +10s seek to 14s, resume progress to 15s, pause. Mini/full metadata agree. Checking offline/duplicate/persistence next.
- NDK ranges ~421 MB downloaded; stopped only the redundant AAR inspection download and resumed remaining official NDK ranges using 64 smaller requests. Combined archive is renamed atomically after completion; waiting build script validates ZIP CRC before installing SDK. Full APK still pending.
- Offline device check passed: generated MP3 advances with Wi-Fi and mobile data both disabled; paused it and restored original radio settings in finally.
- Added native seek-to-zero at the end of a non-repeating queue so Play can replay a finished final song; device completion/replay check pending. Added missing deletion confirmation to Downloads, plus cancel/retry/delete accessibility labels.
- Duplicate import device check passed: selecting the same generated MP3 again kept the library at three songs.
- Force-close/reopen check was interrupted because the entire emulator exited and ADB disconnected during launch; this attempt is not marked pass. Restarted Pixel_9 without clearing data and reconnected ADB. Rechecking persistence after boot.
- Important device-state issue: emulator process exited during force-close/reopen test. Restart command used -no-snapshot-save but loaded pre-existing default_boot (Nov 11 23:19); after that, previously observed songs/playlist are not visible in the reopened Go experience. Did not run app-data clear/uninstall commands. Must investigate scope/snapshot recovery and not claim original device data is currently preserved/visible.
- Root ADB inspection was rejected by automatic approval review because it broadly elevates emulator privileges beyond testing authorization. Do not bypass it. Continuing normal Expo Go UI/debug access; raw debugger WebSocket returned 401, no auth workaround attempted.
- Stopped own redundant Metro 8082 (PID31274) to reduce memory. Current Metro is 8081 (session47220), optional development backend env. Current device temp helper re-pushed because snapshot lacked /data/local/tmp/tempo-uiauto.jar. Own test MP3s re-pushed to /sdcard/Download. Native APK still unbuilt. NDK ~625 MiB of633.3 MiB, session28615; build waiter58249 checksCRC then installs preserved-backup NDK and builds debug+release with --max-workers=2.
- Removed temporary storage diagnostic log; no debug globals/UI left in production source. README/module README/status/V2 docs reconciled to current name-only/embedded engine behavior.

## Resumed after host restart (Nov 12 morning)
- User requested continuing. Host /tmp cache and prior processes are gone; NDK source.properties is still missing. Previous download/build never completed. No emulator currently connected.
- Resume needs a fresh NDK download; use an ignored cache inside the project so a host reboot does not discard it. Prior range reassembly had a size mismatch and was not executed because automatic approval review hit the account usage limit. Do not claim the incomplete archive installed.
- Resumed checks pass: npm test 17/17, Python tests 40/40, TypeScript and lint. New scripts/download-android-ndk.py validates authoritative Content-Range/size, caches 8 MiB parts in ignored .build-cache, checks every ZIP CRC and NDK revision. Current resumed download session58388 exceeds520 MiB and is progressing much faster.
- Taking a local copy of current Pixel_9 userdata and encryption images into ignored .build-cache/pixel9-before-native-tests before further boot/testing. Future emulator launch must use BOTH -no-snapshot-load and -no-snapshot-save to avoid the earlier old-snapshot restoration.
- Official NDK download COMPLETE and every ZIP entry CRC verified; installed revision27.1.12297006 into SDK. Existing incomplete folder preserved as27.1.12297006.incomplete-20261112-082240.
- Current Pixel9 userdata/encryption images backed up successfully (2.8GiB allocated) to ignored .build-cache/pixel9-before-native-tests. Emulator started with -no-snapshot-load -no-snapshot-save, log .build-cache/pixel9-native-tests.log.
- Full debug APK build now running with both x86_64 and arm64-v8a and max-workers2; log .build-cache/assemble-debug.log. No native success claimed before result.
- Full build has passed :tempo-engine:compileDebugKotlin and Java resources/asset merging. Still packaging; no APK result yet. SDK build tools37 resolved automatically.
- Host memory became tight with IDE Java services + Gradle/Kotlin + emulator. Gracefully stopped only our emulator with adb emu kill until compilation finishes; data backup exists. Stopped our completed plugin-compilation Kotlin daemon PID10036 to free ~1GiB. Do not kill user's IDE processes.
- Host restarted again at08:39; build log stopped08:35 during arm64 C++ compilation. Prior process/session no longer exists. NDK and persistent cache survived. Resume incrementally with x86_64 debug first, Gradle max-workers1/no-daemon/1GiB heap, in-process Kotlin, CMake job pools capped1 through ignored local init script. No emulator/Metro during compilation. Full Kotlin/app engine compilation already passed before reboot; APK packaging still not achieved.
- Resource-limited build is progressing: Worklets x86_64 compiled successfully, now building Reanimated. Confirmed Ninja compile/link pools have depth1. Added reproducible optional scripts/limit-android-build.gradle and low-memory README build command. Default app behavior is unchanged.
- Reanimated x86_64 native compilation passed; app C++ now building. Native module Kotlin remains passed.
- Fixed a metadata-preservation gap found during review: when primary JSON is corrupt but a valid backup permits reads, subsequent writes now copy the corrupt primary aside before replacing it. Backup-write/copy failures propagate instead of being swallowed. Added regression test for favorite write after backup recovery preserving original corrupt bytes; validating updated18-test suite.
- DEBUG APK BUILD SUCCESSFUL (8m57s,695 tasks): android/app/build/outputs/apk/debug/app-debug.apk ~104MiB, x86_64 emulator build. Complete native engine compiled and packaged. Next device startup/search/download tests; standalone ARM64/release still pending.
- Restarting Pixel9 with current data, no snapshot load/save, lower1536MiB RAM/software renderer; Metro on8081 with max-workers1 and no backend env override. No desktop backend started for embedded verification.

## Latest priority: first standalone APK, reduced resources
- User opened emulator and requested reducing resource usage, then building first APK. Debug emulator APK already exists (~104MiB); prioritize standalone release for arm64-v8a+x86_64, then installation/startup/native smoke test. Defer broad V1 device matrix until artifact is available.
- Host rebooted again at08:59; own prior Metro/emulator sessions are gone. User's current emulator consumes~4.2GiB with~1.8GiB available RAM. Explained that it will be gracefully closed only during compilation and reopened for installation. No app data clearing/uninstall.
- Low-memory init script now also limits JS bundling to one worker. Release will use max-workers1, in-process Kotlin, 1GiB heap/ActiveProcessorCount2, low scheduling priority, no Gradle daemon persistence, no emulator/Metro/backend during build.
- Standalone release build session59306 is running: nice10, Gradle max-workers1/no-daemon, heap1GiB, ActiveProcessorCount2, in-process Kotlin, JS max-workers1, CMake compile/linkpool1. Both ARM64+x86_64 Worklets passed; Reanimated ARM64 compiling. Host currently~4GiB available, emulator closed gracefully and no dev servers running. Goal is first standalone APK then lightweight install/launch/embedded smoke checks.
- Release compilation progressed through both architectures' Worklets/Reanimated and reached app C++ for arm64-v8a and x86_64. One compiler at low priority remains; host~4GiB available. No running test server/emulator during compile. Native registry generated ExpoModulesPackageList.kt explicitly includes TempoEngineModule.
- APK finalization plan: verify release signature, both ABIs, bundled JS and matching Python asset; copy first artifact to builds/; install with adb -r preserving app data; lightweight launch/search/download smoke test without Metro/desktop server. Further V1 matrix remains separate from latest first-APK priority.
- Final media-policy check found yt-dlp's default may fabricate X-Forwarded-For for geographic restrictions on some supported sites. Explicitly disabled this in backend options (geo_bypass=False) and native common request (--xff never), preserving the requested no-restricted-content-bypass behavior. Native release Kotlin compile has not run yet, so this change will be included in first release. Added behavioral regression against real InfoExtractor geo initialization.

## User stopped automation: manual build requested
- User explicitly requested “stop all and help me do it manually.” Stop build/server/emulator work; do not resume automatic compilation or testing without a new request.
- Inspection found no active Tempo Gradle wrapper, Expo/uvicorn server or emulator (host apparently restarted again); standalone release log ended during release Java compilation and no release APK exists. Existing x86_64 debug APK remains at android/app/build/outputs/apk/debug/app-debug.apk (~104MiB).
- Stopping remaining Gradle/Kotlin build daemons (including IDE-started build daemons, as requested to free resources), leaving VS Code/language server intact. ADB server stopped too.
- Manual handoff: run low-memory assembleRelease with max-workers1, no-daemon,1GiB heap/ActiveProcessorCount2,in-process Kotlin, optional nice10 and scripts/limit-android-build.gradle. Both arm64-v8a+x86_64 supported. Reuses compiled outputs; keep emulator closed during compile. Then start emulator manually and adb install -r app/build/outputs/apk/release/app-release.apk. Standalone artifact has not yet been produced or runtime-tested.

## Manual release export failure
- User's manual assembleRelease reached createBundleReleaseJsAndAssets and failed while Expo Router exported a Node/web server manifest (getLayoutAnchor/loadLayout stack). Initial exception line was not included in pasted tail.
- Inspected installed Expo58 CLI: native export triggers exportStandaloneServerAsync whenever isApiRoutesEnabled(exp) is true; web.output=server enabled that path even though this app has no +api routes or React server features. Root layout imports native audio/filesystem services, inappropriate for that Node route crawl.
- Changed app.json web.output from server to single (client SPA configuration) to disable the unnecessary embedded web-server export. Kept Android code, cached native outputs and existing web async routes intact. No Gradle build, Metro/server or emulator started; manual build preference remains active.
- Verifying resolved SDK58 export gate, TypeScript and lint; full APK build remains for user to rerun manually with existing low-memory command. Do not claim release APK success until rerun.
- Manual-export fix checks PASS: resolved SDK58 API/server export gate=false; TypeScript passes; Expo lint passes; git diff --check passes. No build/services restarted. User can rerun same assembleRelease command without clean; native caches remain available.

## Manual release lint: explicit domain attributes
- User's manual build progressed to :app:lintVitalRelease and reported two NetworkSecurityConfig errors: domain elements lacked includeSubdomains.
- Added explicit includeSubdomains=false to all exact-host exceptions in both main (127.0.0.1/localhost) and debug (plus10.0.2.2) XML resources. Updated plugins/withTempoEngine.js too so prebuild regenerates corrected resources.
- Kept HTTPS-only base policy and exact-host scope. No lint suppression/baseline, Gradle build, emulator or dev server started. XML parsing/host/attribute checks and plugin syntax verification pass; checking TypeScript/lint before manual rerun handoff.
- Checks PASS: both XML documents parse and every domain has includeSubdomains=false; temporary generation check confirms plugin emits matching main/debug XML; plugin JS syntax, TypeScript, Expo lint and git diff --check pass. Android lint/assemble remains for manual rerun; no services/build restarted.

## First standalone release APK: manual build succeeded
- User reports BUILD SUCCESSFUL in1m58s,891 tasks (111executed/780up-to-date), after correcting server export and NetworkSecurityConfig attributes.
- Android release JS bundle exported successfully (1624modules,49assets), and standalone APK path is android/app/build/outputs/apk/release/app-release.apk.
- User retains manual installation/testing control. Next steps: open Pixel9 manually, adb install -r APK, launch com.nabil.tempo/.MainActivity. No build, server or emulator started automatically. Native search/conversion/runtime tests remain unverified for this release until device checks.

## Next update requested: background media, branding, playlist queue/progress
- User reports Python server, single-track downloads and playback working. New authorized scope: background playback/system controls; original purple launcher/splash assets; remote playlist resolve/download through existing manager; actual extraction/conversion/transfer progress and retry; consistent icons; staged checks/device tests and exact commands.
- Inspected installed Expo58, current single AudioPlayer bridge/store, manager with per-source locks/temp files, shared library/playlist JSON and Python job/worker endpoints. Current UI download state is hook-local, server jobs expose preparing/ready/failed without measurable extraction progress. Local playlists currently only store songIds, no remote URL/order mapping.
- Plan phases: (1) SDK58-supported background/native media queue + test; (2) original coherent asset generation/config and cold launch; (3) playlist resolver/shared queue/order/dedupe/retries + tests; (4) real worker/native/file progress and UI polish + end-to-end/offline regression. Keep resource caps and current backups; never clear app data or load old emulator snapshots.
- Phase1 implementation: one SDK58 AudioPlaylist now owns native queue/repeat/system controls; playbackBridge synchronizes native pause/play/seek/track changes into existing Zustand state without replay loops. In-app next/previous delegate to native; shuffle now stores a shared ordered queue and remembers unshuffled order. Queue/position/settings still restore paused.
- Explicit expo-audio background playback configuration added with recording disabled. New bridge regression tests pass (20 frontend tests total), TypeScript passes; lint being checked. No Android device connected initially; native config source backed up before non-clean prebuild. Device background test is next before phase2.
- SDK58 prebuild unexpectedly regenerated Android despite not passing --clean; config/source backup exists and module/network behavior is represented in config plugins. Check current CLI's explicit no-clean option before later generation. Android now contains AudioControlsService and foreground media-playback permissions. Existing emulator data untouched; current userdata/encryption images copied to .build-cache/pixel9-before-media-update before boot.
- Background debug build session63184 runs x86_64 only, low priority/single compiler/1GiB heap. No emulator running during compilation. Existing 20 JS tests, TypeScript and lint pass.
- Background debug APK build PASS (10m6s). SDK58 CLI help confirms prebuild defaults to recreating native folders; ALL future sync commands must explicitly pass --no-clean --no-install. Prior config/source backups remain intact; no emulator data cleared. Rebuilding APK assets was required after regeneration.
- Starting Pixel9 with --no-snapshot-load/--no-snapshot-save,1536MiB/software GPU and Metro with one worker for phase1 device checks. Current userdata backup .build-cache/pixel9-before-media-update exists.
- New background APK installed successfully with adb -r (existing app data preserved). Emulator5.5GiB RSS plus IDE-started Gradle/Kotlin daemons caused memory pressure. Checked installed Java extension setting and set workspace java.import.gradle.enabled=false to prevent repeated automatic model imports; preserved user's new interactive updateBuildConfiguration preference. Manual Gradle builds remain supported. Stopped idle build daemons after our build completed, keeping editor/language server. This workspace setting is reversible in .vscode/settings.json.
- Phase1 custom APK launches current JS bundle (1784modules), SDK58 development LAN permission/intro encountered. Android primary-user install was retried with --user0 after first install wasn't visible; confirmed package path. No uninstall/data clear. Source ABI/appID valid.
- Emulator screens changed due user interaction (Raja music entered/search started between our actions). Asked asynchronous five-minute test window; avoid assuming unrelated UI actions passed. Device background/system-control assertions still pending; 20 service tests pass.

## Live preview before APK approval (latest steering)
- User answered to keep emulator available and do automated service checks first; do not take it over for device automation right now. Device phase1 lock/system checks remain pending.
- User sees no visible changes and requests removing old versions, then running updates in real time before agreeing to/building another APK. Explained phase1 changes were engine/background controls only, visible branding/playlist UI not yet implemented.
- New workflow constraint: no further APK/native builds until user approves the live result. Inspect duplicate Tempo package IDs/stale Metro connections, preserve all music/app data, show visible changes through one development app+Metro. Native icon/splash/config and native playlist adapter changes need the later approved build; Python transport can power live playlist/progress preview now.
- Continue full requested update through service tests and live JS/assets preview; defer device takeover and APK build until approved.
- Duplicate check: only com.nabil.tempo installed, one Metro PID22714 on8081, no8000/8001 Python server. No old Tempo package to uninstall; kept current dev app/data. Told user visual work will update this live app; native launcher/splash wait for approved build.
- Icon implementation will use an original repo-native SVG dotted music-note mark, rendered reproducibly to actual PNG launcher/adaptive/monochrome/splash assets. This fits simple vector icon work (imagegen skill inspected; not applied because vector/code-native assets are appropriate). New sibling asset names preserve originals.

## Finishing missing playlist/progress/visual features
- User correctly called out that playlist downloads, actual progress, and visual assets were unfinished. Continuing these now; no APK/native build until live-preview approval.
- Added original dotted music-note SVG and rendered launcher/adaptive/monochrome/splash PNGs with a reproducible CairoSVG script. app.json now references Tempo assets and dark background matching the app. Native splash requires later approved binary; live page header previews the new branding immediately.
- Replacing Unicode navigation/player controls with the existing Ionicons family and 48dp buttons. Backend now has bounded public playlist resolution and worker progress-file reporting from real yt-dlp hooks; validation/tests next.
- Shared FIFO queue now survives navigation and persists job/batch history. Interrupted jobs restore as retryable failures; source URL locks and duplicate batch entries are skipped. Offline playlist membership is reconciled in source order after each successful save; individual and group retry preserve successes.
- Added real phase-aware progress cards, bytes/percentage only when measurable, indeterminate conversion/verification, completion only after native audio decode probe and metadata save. Playlist screen supports public link resolution, Original/Low/Medium/High selection, separate rights confirmation, unavailable rows, offline Play.
- Native embedded adapter source now includes matching YouTube playlist/progress endpoints. No native build executed: current APK uses explicit EXPO_PUBLIC_DOWNLOAD_ENGINE=server for live preview, retaining embedded-first default otherwise.
- Checks so far: 23 frontend service tests pass (including new playlist partial-success/order/restart/cancel/decode failure cases), 47 backend tests pass, TypeScript and lint pass. Device UI/background/offline/native splash checks are still pending per user's keep-emulator-available/live-review preference.
- Restarted own Metro on8081 with server transport and local FastAPI on8000, single worker. Stopped hung sandbox-only pytest process; suite succeeds with normal socket permissions. Did not uninstall or clear app data.
- Real integration testing found HTML5 playlist elements shared their parent webpage_url. Corrected source identity to each HTML5 element URL (and multi_video entry URL), preventing distinct audio elements being collapsed as duplicates. Own generated-audio FFmpeg conversion/ffprobe check passed; rerunning full suite after identity fix.
- Metro Android bundle compiles (1822 modules); backend /health responds. Read-only device screenshot showed Android Home, so did not claim updated screens or background controls were exercised. User is already reaching playlist lookup through live preview (invalid name instead of URL receives helpful400).
- Final backend suite PASS:49 tests, including real generated-audio HTML5 playlist resolution/order and FFmpeg conversion plus ffprobe verification. No third-party content downloaded. Corrected source identity is loaded in restarted Python server.
- Read-only current device screenshot confirms live Tempo header/new purple artwork and Download playlist card rendered, with appropriate error when a name was entered into the playlist URL field. Added more specific guidance back to name search, keyboard dismissal and light status-bar text on the dark app.
- Added deleted-audio state handling so completed queue history cannot falsely claim missing songs are saved offline; group retry can restore those tracks. Collapsed playlist summaries avoid rendering every item twice in Downloads. Latest frontend suite now24 tests.
- README documents two-terminal live preview, emulator/USB-phone URLs, dependencies, later non-clean prebuild/low-memory build/install commands, native splash limitations and artwork regeneration. No APK/native build or emulator navigation was performed during this stage.
- Final checks PASS:24/24 frontend tests,49/49 backend tests, TypeScript, Expo lint, git diff --check, public Expo config and all four1024px PNG decode checks. Live Metro8081 and Python8000 left running for user review. Remaining: user approval for native rebuild, latest Kotlin compile, release launcher/splash, uninterrupted background/system-controls and offline playlist device checks.

## Playlist name search and reported audio lag
- User wants playlist name search like single-song search, plus investigation of stuttering and lock-screen service error. Preserve live-preview/no APK until approval constraint.
- Current device inspection shows ONLY Expo Go (host.exp.exponent), not com.nabil.tempo. Android logs explicitly say Expo Go AudioControlsService not found. Project config/source already include service and foreground permissions; this is a Go capability mismatch, not evidence that background config is missing from source.
- Audio session logs show continuous normal-speed playback and no AudioFlinger underruns; emulator timing stalls/frame skips and host swap nearly full observed. Do not claim stutter fixed or source audio defective on this evidence. Investigating avoidable transport commands and playback preview policy.
- Added API-key-free bounded playlist name search through filtered yt-dlp search URL, with native source parity. Playlist UI now accepts names and offers result download actions followed by quality and rights confirmation; no pasted URL needed. Existing saved playlist source links remain internal for retries.
- Real API-key-free playlist search for “Raja music” succeeded with10 genuine metadata cards. Source tracks are resolved only when a result is chosen; separate quality/authorization and shared batch queue retained. UI no longer requires URL entry.
- Expo Go capability guard added using SDK58 Constants.executionEnvironment. Skip unsupported lock-screen/background calls in Go (no console suppression); foreground playback retained, player explains custom-build requirement. Native background config stays enabled.
- Removed redundant seek-to-zero after skipTo and repeated identical native loop/volume writes. Regression proves metadata refresh doesn't seek/rebuild playing audio and Go doesn't invoke missing service. Tests27 frontend/54 backend, TypeScript and lint pass. Audible stutter still unconfirmed; read-only diagnostics show normal1× progress/no mixer underruns, timing stalls and high memory/swap usage.
- Final SDK58 runtime review: ExecutionEnvironment.StoreClient includes BOTH Go and custom development clients. Replaced the initial environment comparison with Expo's documented isRunningInExpoGo() helper, so the guard excludes only Go and preserves native controls in development APKs as well as releases. Added capability regression for Go/custom/web.
- Host PipeWire diagnostics also show zero scheduling error counters in the inspected graph. No global audio settings were changed and no audio was recorded. Audible stutter remains a listening/device follow-up, not a claimed fix.
- Final checks PASS:27/27 frontend tests,54/54 Python tests, TypeScript, Expo lint, git diff --check and live Android Metro bundle. HTTP /api/playlists/search?query=Raja%20music returns10 actual cards. Both preview services left running; no APK build, emulator navigation, audio recording, uninstall or data clearing. Await user's listening result for remaining audible-stutter confirmation.

## Remaining small stutter: measured diagnostics
- User still hears a small lag even with highest MP3 quality. Checked current code/native audio path and read-only runtime diagnostics; did not change quality or apply speculative codec fixes.
- During active playback Android reports speed1.0, buffered audio ahead of playback, and zero AudioFlinger mixer underruns. Existing probe players are released after validation; focus release accounts for active playlists. No proof of ongoing queue reload/seek loop in this sample.
- Host output is Bluetooth A2DP, emulator stream44.1kHz into48kHz output; PipeWire error counters0. Host swap2037/2047MiB used but vmstat short sample shows no active swapping and mostly idle CPU. These are possible environment factors, not a confirmed root cause.
- Asked user to compare laptop speakers with Bluetooth before changing app transport further. No system output, emulator settings, files, native builds, or app data modified. Collecting short native playback/underrun snapshots in ignored .build-cache/audio-stutter-samples.json; audible issue remains open pending comparison.
- Short playback samples completed: track0 position177→180seconds, then track1 position0→5seconds, all PLAYING at1× with buffered audio and zero mixer underruns. This does not establish the audible problem's cause. TypeScript and lint pass; no app implementation changes were made in this diagnostic turn. Speaker/Bluetooth comparison remains pending.

## Phone release and GitHub publication authorized
- User explicitly approved building now, will investigate audio on real phone. Also requests NEW PUBLIC GitHub repository, explanatory README, source push and APK release upload. Earlier no-build constraint is superseded by this approval.
- Local repository has no remote, no commits and no Git author setup; GitHub CLI absent. Preparing official checksum-verified CLI and GitHub authentication. Repository name Tempo unless account collision; repository identity comes from authenticated account, not guessed ownership.
- Emulator closed gracefully (no snapshot load/data clear) and own Metro/Python servers stopped during low-memory ARM64 standalone release build. Backed up native config and running SDK58 prebuild with explicit --no-clean --no-install.
- Extended .gitignore to exclude module build outputs, local APKs, connector configs and environment secrets before first source commit. Committed extractor asset remains included; transient build/venv/cache files excluded.
- User clarified: create a NEW PUBLIC repository, explain the app in README, and upload the APK as a GitHub release. Official GitHub CLI v2.103.3 downloaded to ignored cache and SHA256 verified. Device-login authorization requested; never requested passwords/tokens. Auth config stays under ignored .build-cache/github-auth.
- Prebuild PASS using --no-clean --no-install. Source manifest includes AudioControlsService + media-playback permissions and original Tempo artwork. ARM64 standalone release running with embedded transport, dotenv disabled, one worker/1GiB heap, CMake pools1; local-test R8 disabled to limit memory.
- Fresh checks PASS27 frontend/54 backend, TypeScript/lint. Source publication scan reports no recognized credential patterns. Excluded unused9MiB demo media/mock fixtures without deleting local copies; clean source candidates ~4.4MiB including3.1MiB pinned extractor.
- README rewritten for public readers: features, authorized downloads, install/use, Ubuntu/ExpoGo/native setup, storage/quality, limits and honest remaining phone checks. Added reproducible scripts/build-phone-apk.sh producing ARM64 APK + checksum.
- Phone build passed :tempo-engine:compileReleaseKotlin, including the new playlist-name search and progress callback. Earlier unverified native compilation is now verified. App ARM64 C++ and Expo modules progressed without fatal errors; JS bundle/package checks still running.
- User requested manual GitHub sign-in help. Provided the official device-login URL and one-time code from the running CLI flow; no password/token requested. Build continues while user authorizes.
- ARM64 standalone release BUILD SUCCESSFUL in11m3s (822 tasks). Artifact copied to builds/Tempo-1.0.0-arm64-v8a.apk (~80.27MiB), checksum builds/SHA256SUMS.txt. SHA2564980b53587a1d5fa5bee0ef329c9e0aa85e98b65b1700fe99a9b5715c4ac31e8.
- APK ZIP CRC verification, ARM64-only ABI, bundled JS, exact pinned extractor SHA, native Python+FFmpeg libraries and APK v2 signature all pass. Manifest/media-service check finishing. No physical phone attached; runtime listening/background/offline checks remain for user's phone.
- Final manifest verification PASS: com.nabil.tempo1.0.0, minSDK24/target36, foreground-media permissions and AudioControlsService mediaPlayback type present. Artifact is a standalone local-test APK; release notes and public README prepared. GitHub create/push/release still await the active device-login flow (no credential printed/saved in tracked files).

## GitHub authorization completed
- GitHub device login completed for nabil-2003. Created NEW PUBLIC repository https://github.com/nabil-2003/tempo (no existing repository overwritten). Source author uses authenticated profile name and GitHub noreply email; credentials remain under ignored cache.
- Fresh final checks PASS27 frontend tests/54 Python tests, TypeScript and Expo lint. README now links directly to GitHub Releases/APK; no source code changes since built artifact. Preparing first main-branch commit and release upload with verified checksum.
