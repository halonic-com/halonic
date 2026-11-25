# Decision: cache the emulator's Android 15 image and retry sdkmanager in CI

- Task: HAL-18065
- Approval: the board's CI sweep asked for this fix on HAL-18065 (cache the SDK image keyed on the exact image and version, retry the download with a short backoff); the CTO (Liam) approves this note in review
- Kind: internal

## What changes

Only the `android-device-keys` job in `.github/workflows/ci.yml`.

- The Android 15 system image is cached. The cache key is the exact sdkmanager package and the
  revision `sdkmanager --list` reports for it, so a new revision gets a new key. On a cache hit the
  image is not downloaded.
- Every sdkmanager call retries up to 3 times, waiting 15 and then 30 seconds between tries.
- Only runs on `main` save the cache, like the existing Gradle cache.
- The emulator test itself is unchanged.

## Why

The job downloaded the image fresh on every run with no retry. Google's server sometimes answers
"unknown archive" (3 of 52 pushes to `main`), which turned the push run red and could keep the
Merger's red-main freeze on.

## Covers

- .github/
