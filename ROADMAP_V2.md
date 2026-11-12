# Tempo V2 roadmap

Profile/account management, login, cloud sync, premium subscriptions/payments,
ads, AI music generation and personalized recommendations are deferred. Reusable
Profile UI remains in `src/deferred/ProfileScreen.tsx`; its route redirects Home.

V1 now includes a local Android module for bundled Python/yt-dlp/FFmpeg and name
search. Its full APK build/runtime verification is tracked in TEST_REPORT.md.
Broader source support beyond the canonical search-result workflow, iOS native
extraction, durable background download resume, richer metadata, shared-library
export/scanning, background/lock-screen playback and more codec/device coverage
remain future work. Restricted-content bypass is not planned.

Test fixtures stay under tests and are never loaded as production library data.
