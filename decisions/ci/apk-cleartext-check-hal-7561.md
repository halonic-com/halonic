# Decision: the Play build checks the built APK for cleartext traffic

- Task: HAL-7561
- Approval: Liam approves this note in review on the review task HAL-7748
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0fS1SEtUBlQKknP9SNDVLJm+xX5dJEp1E1DXF1XpA4a7eVv4Wd5o3jr7kfjiYLkzZxLuTJxtBxfM6HRA9SP+BA==

## What changes

In `.github/workflows/android-play.yml`, the `play-apk` job runs the cleartext check on the built
APK as well as on the manifest sources. `apps/studio/src-tauri/android/check-cleartext.mjs` gets
an `--apk` mode that reads the compiled manifest inside the APK and fails if it allows cleartext
traffic or points at a network security config that does.

Triggers, rights, runners and secrets don't change.

## Why

The source check only sees what we wrote. The APK is what ships, and a plugin or a merged
manifest can add cleartext traffic after the sources were checked.

## Tests

No test was weakened or skipped. The new mode was run on a real release APK.

## Covers

- .github/
