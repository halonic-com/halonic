# Decision: CI's Android job runs the Kotlin plugins' JVM tests

- Task: HAL-16643 (follow-up to Liam's review of #5261 on HAL-16491)
- Approval: Liam asked for these tests in his review of #5261 and approves this note in his review
  of this pull request on HAL-16643
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:e/pTr4eUf+7qYRqLPp4T39yjFlIxjXQ4jyB7hlMZq7MlpVrbDdtTdfyVahh6sIflZYIXL3DKwd1Kt4BGEIKMDw==

## What changes

One new step in the `Android shell (debug APK)` job of `.github/workflows/ci.yml`, after the debug
build: `./gradlew :app:testUniversalDebugUnitTest` in `apps/studio/src-tauri/gen/android`, with
the runner's JDK 17. No other job, trigger, permission or secret changes.

- It runs the JUnit tests of `PhoneScreens.kt` on the JVM: no emulator, no device.
- It uses the Gradle files the build step already wrote and needs no Rust libraries, so it builds
  no Rust again.
- It adds no dependency: JUnit was already in the app's Gradle file.

## Why

Liam asked for tests of the phone screens' intents (the settings page, the Tailscale app, the Play
Store app and the browser fallback) before the requirement goes from draft to active. Without a
step in CI those tests would never run, because the board's shared runner has no JDK.

## Covers

- .github/
