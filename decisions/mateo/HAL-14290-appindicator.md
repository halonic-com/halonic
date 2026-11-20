# Decision: the Linux Tauri job installs the app-indicator library

- Task: HAL-14290
- Approval: Liam approves this note in review of PR #4196
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:znZyEiXKX77K7TEZrTLuwNesLgjXUStLDafpNo6LL4xWjl1JKEZBxSrmJDIF5Ir4kc6tTpSgk10ocKviZjBbAw==

## What changes

In `.github/workflows/ci.yml`, the `Tauri shell (Rust checks)` job's "Install the Linux libraries
Tauri needs" step adds `libayatana-appindicator3-dev` to its package list, with a comment saying
why. Nothing else in the workflow changes: no trigger, right, runner, secret or time limit.

## Why

Studio's tray icon (HAL-14220, design approved on HAL-14213) turns on Tauri's `tray-icon`
feature, which links the app-indicator library on Linux. Without the package the Rust checks
fail to link. The merge-queue runner runs the same `apt-install` step on the standard image, so
this one list covers it too.

## Tests

No test was weakened or skipped.

## Covers

- .github/
