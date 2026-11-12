#!/usr/bin/env bash
# Standalone ARM64 testing APK, with bounded compiler memory/concurrency.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
export EXPO_NO_DOTENV=1
export EXPO_PUBLIC_DOWNLOAD_ENGINE=embedded
export CMAKE_BUILD_PARALLEL_LEVEL=1
unset EXPO_PUBLIC_BACKEND_URL
npx expo prebuild --platform android --no-clean --no-install
cd android
nice -n 10 ./gradlew :app:assembleRelease \
  -PreactNativeArchitectures=arm64-v8a \
  -Pandroid.enableMinifyInReleaseBuilds=false \
  --max-workers=1 --no-daemon -Dorg.gradle.parallel=false \
  '-Dorg.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m -XX:ActiveProcessorCount=2' \
  -Pkotlin.compiler.execution.strategy=in-process \
  --init-script ../scripts/limit-android-build.gradle --console=plain
cd "$project_dir"
mkdir -p builds
cp android/app/build/outputs/apk/release/app-release.apk builds/Tempo-1.0.0-arm64-v8a.apk
cd builds
sha256sum Tempo-1.0.0-arm64-v8a.apk > SHA256SUMS.txt
printf '\nAPK: %s/builds/Tempo-1.0.0-arm64-v8a.apk\n' "$project_dir"
