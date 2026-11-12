# Decision: the Release workflow attaches the APK Play signed

- Approval: option A on HAL-6852 (the GitHub release ships the APK Play signed); the CTO (Liam) approves this note in review
- Kind: internal
- Task: HAL-1203

## What changes

- `android-play.yml` can be called by another workflow (`workflow_call`), with the inputs `dry_run`
  and `version`. When `version` is set, the build fails unless the app's version in
  `tauri.conf.json` is the same, so a tag can't ship a different app version.
- The `sign` job also accepts a `v*` tag, not only `main`, because a release runs from a tag. The
  `release` environment's own rule still decides which refs may use the upload key.
- `release.yml` gets an `android` job that calls it on real runs only, never on dry runs, so
  nothing reaches Play from a dry run.
- `draft-release` downloads the APK Play signed and adds it as `Halonic-<version>-android.apk`
  (name from HAL-1119), exactly as downloaded, with its line in `SHA256SUMS`. Dry runs add a
  placeholder file instead. The release notes link to it.
- Real releases are still refused by `release.yml` until the real Studio build is wired in, so this
  publishes nothing today.

## Why

One signature everywhere: GitHub and Play installs can update each other. The signature check
against Play's app signing key stays in `play-apk`; a release fails if it doesn't match.

## Covers

- .github/
