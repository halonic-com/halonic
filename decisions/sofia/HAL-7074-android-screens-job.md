# Decision: a hand-run workflow that captures the Android app's screens

- Approval: Liam approved this follow-up to HAL-6953 on HAL-6973; the CTO (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:e6SV8cQbtTHU45BVdp4oGO9ZfyjEaqpJJWbjeGYZR8tpEjJazs+KpCv6nWzzLuqRu8meuMvc4XLH1qn9ku9lDQ==
- Task: HAL-7074

## What changes

A new workflow, `.github/workflows/android-screens.yml`. No existing workflow changes.

- It runs by hand from the Actions tab, and on a pull request that changes the workflow or
  `apps/studio/src-tauri/android/`. It never runs on other pull requests, on push or in the merge
  queue.
- It downloads CI's `android-debug-apk` artifact (main's newest, or the CI run given as input),
  boots an Android 15 emulator with KVM and runs `capture-screens.sh`. It uploads `connect.png`,
  `computer-too-old.png`, `app-too-old.png` and `not-answering.png` as the `android-screens`
  artifact.
- It holds no secret. Its token can read the repo's contents and Actions artifacts only.

## Why

The Play listing needs real captures of the app's own screens, and the board's shared runner has no
KVM, so the emulator can't run there. GitHub's Ubuntu runners have it. Running on pull requests
that change the script tests the script where it changes, without slowing every other pull request.

## Covers

- .github/
