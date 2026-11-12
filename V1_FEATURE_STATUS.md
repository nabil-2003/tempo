# Tempo V1 status

Baseline audit: Expo SDK 58 / React Native 0.88, existing `app/` Expo Router routes,
expo-audio/FileSystem and Android project. Existing persistent music and optional
backend jobs were preserved. Prototype Home/search/history/playlists/player state
was replaced with actual local metadata. Profile code is retained in
`src/deferred` and hidden from V1 navigation.

| Feature | Current evidence | Remaining verification |
|---|---|---|
| Single-track downloads | Existing user-confirmed flow; service regressions pass | New decode gate on device |
| Background/media controls | SDK58 AudioPlaylist bridge compiled in phone release; shared shuffle/queue/seek/status tests pass | Home/lock/notification/queue device matrix |
| Playlist downloads | Name search verified against real public metadata; Python and bundled adapter source, shared persistent queue, dedupe, ordered offline membership, partial success/retry tests | Native adapter compiled in ARM64 release; phone runtime/end-to-end pending |
| Real progress | Actual yt-dlp hooks, job polling, source/transfer/verification phases; real FFmpeg integration | Visual phase timing and cancellation on device |
| Branding/icons | Original SVG+PNG launcher/adaptive/monochrome/splash assets wired to config; consistent Ionicons and 48dp controls | ARM64 release built; phone launcher/cold-launch verification pending |
| Library/import/offline | Existing saved-file storage/playback preserved; regression suite passes | Recheck new playlist in airplane mode |
| Phone testing | ARM64 standalone APK built and verified; development services stopped | Physical phone installation and listening checks |

Current checks: **27 frontend tests**, **54 Python tests**, TypeScript and Expo
lint. Latest exact outcomes and any pending checks are recorded in the test log.
See [TEST_REPORT.md](TEST_REPORT.md) for detailed executed checks. No unexecuted
native test is counted as a pass. The approved ARM64 release includes the latest native playlist/progress and artwork
changes. Physical-phone verification remains outstanding.

Expo Go now skips the unavailable foreground media service; custom builds retain
background controls. Stuttering remains a listening recheck after removing
redundant seeks/settings writes; no source-quality defect has been established.

Phone APK build PASS: standalone ARM64 release, native Python/FFmpeg and exact
extractor bundle verified, APK signature verified. Public GitHub repository created; source and release publication in progress.
