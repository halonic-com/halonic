# Decision: the release manifest records srt's Windows setup version

- Approval: the task asks for this change (HAL-5404, from the design on HAL-3779, section 4); Liam approves this note in review on HAL-5404
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xL+eeQ7udVpmvu0GzaE46JJ6W2SlsT5Pkv9UwUK1svaAYLs2len9AShPRg4JA8r+Bl1mdmG+KRBnkYDsBzDcBA==

## What changes

`packages/adapters/sandbox-srt/windows-setup-version.json` records the pinned sandbox-runtime version and the Windows setup version its `srt-win` needs (3 for 0.0.82). The `updater-manifest` action reads it and writes it into `latest.json` as `halonic.srtWindowsSetupVersion`, and the release's file check refuses a `latest.json` without a whole number above zero there. The Windows update test's own `latest.json` carries the same key, so the real update from 0.1.0 to 0.1.1 shows that Tauri's updater still accepts the manifest. A new requirement, `sandbox-srt.windows-setup-version`, holds the record to the pin (unit test) and to the real `srt-win` after its install (a fence test in the `sandbox-windows` job, which runs for every lockfile change).

## Why

The design says the updater must announce the one administrator prompt before it installs an update that changes the setup version, and refuse a rollback across one unless `windows-uninstall` runs first. Both need to know the setup version of the release on the other side, which only the manifest can tell. The pre-flight and the rollback guard follow in their own pull requests on HAL-5404.

Nothing users see changes yet: the field is only written.

## Covers

- .github/
