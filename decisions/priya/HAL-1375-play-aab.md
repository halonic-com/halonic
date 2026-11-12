# Decision: a workflow that builds the signed Android App Bundle for Play

- Approval: the board asked for a Play-format build in CI on HAL-1375 (12 Nov), with the upload key only in the `release` environment; the CTO (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:lBgrglREC/KYA8C1KUOrLlALBkYBMdg1YDuccdC1e/g5bQyld0JYc64jd8h7PBjQHD9T1NADm6NwrJJOSNTpAQ==
- Task: HAL-1375

## What changes

A new workflow, `.github/workflows/android-play.yml`, and a new composite action,
`.github/actions/sign-aab`. No existing workflow changes.

- The workflow runs by hand from the Actions tab, and as a dry run on a pull request that changes
  either file. It never runs on push, on a tag or in the merge queue.
- The `build` job makes an unsigned release `.aab` of the Android shell, holds no secret and
  restores no cache at all (no pnpm store, Rust or Gradle cache). Its version code is the number of minutes since 1 Jan 2026
  (UTC), so every build is higher than the one before. A dry run signs a copy with a key made for
  that run.
- The `sign` job is the only one that reads the upload key. It runs in the `release` environment,
  only from `main` and never in a dry run, and has no token permissions.
- The action signs with `jarsigner` from the runner's Java 17 and checks the signature. It prints
  only the certificate's public fingerprint.

## Why

Play App Signing is on, so Google signs what users install and our key only signs uploads. Building
and signing in separate jobs keeps the key off the machine that runs the build's own code and
dependencies. The time-based version code needs no record of the last upload and can never repeat,
which Play requires.

## Covers

- .github/
