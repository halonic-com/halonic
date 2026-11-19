# Decision: check the device key contract on the real Android Keystore in CI

- Approval: decided on HAL-13783 (follow-up to HAL-12469); the CTO (Liam) approves this note in review
- Kind: internal
- Task: HAL-13784

## What changes

One new job in `.github/workflows/ci.yml`, **Android device keys (emulator)**. No other workflow
changes.

- It runs after the debug APK build in the same run and uses that run's APK. It builds nothing and
  restores no cache.
- It boots an emulator, installs the APK, writes a trigger file into the app's data folder with
  `adb shell run-as`, starts the app and fails unless the app writes `ok` as the check's result.
- It holds no secret, its token can only read the repo's contents, and its checkout keeps no
  credentials.
- It is part of `ci-ok`, so a contract failure on the real Keystore blocks the merge.

## Why

The device key contract was only checked against `FakeWrapper`. This job runs the same contract
against the real `AndroidKeystore` on an Android runtime. The in-app check is debug-only at compile
time (`cfg(all(target_os = "android", debug_assertions))`, with a `compile_error!` for any build
without `debug_assertions`), and `run-as` refuses a non-debuggable app, so release builds carry
neither the check nor a way to start it.

## Covers

- .github/
