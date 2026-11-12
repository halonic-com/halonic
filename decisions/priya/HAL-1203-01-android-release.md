# Decision: the Android Play build uploads to Play and keeps the APK Play signed

- Approval: option A on [HAL-6852](/HAL/issues/HAL-6852) (the GitHub release ships the APK Play signed); the board set up Play access with Workload Identity Federation and approved the draft upload on [HAL-6855](/HAL/issues/HAL-6855) (12 Nov); the CTO (Liam) approves this note in review
- Kind: internal
- Task: HAL-1203

## What changes

A new `play` job in `.github/workflows/android-play.yml`, after `sign`. No other workflow changes.

- It runs only when `sign` ran, so only from `main` and never in a dry run or on a pull request.
- It runs in the `release` environment, the only one Play's identity provider accepts, and is the
  only job with `id-token: write`. It signs in with `google-github-actions/auth`, as the board
  directed; no key file exists. It never sees the upload key.
- It stops with a clear message when `PLAY_WIF_PROVIDER`, `PLAY_SERVICE_ACCOUNT` or
  `PLAY_APP_SIGNING_CERT_SHA256` is empty.
- In one Play edit it uploads the signed bundle as a draft on the internal testing track. Play
  accepts only drafts while the app has never been published.
- It waits up to 10 minutes for Play's signed universal APK (`generatedApks`), downloads it and
  fails unless `apksigner` shows exactly Play's app signing certificate. It also checks the package,
  the version code, `usesCleartextTraffic=true` (HAL-1140) and `allowBackup=false`.

## Why

Play App Signing is on, so phones that install from Play get Google's signature. An APK signed with
our upload key could never update a Play install, or the other way round. Shipping the APK Play
signed gives one signature everywhere. There is no fallback to an upload-key APK: if Play is slow
or down, the release waits.

## Covers

- .github/
