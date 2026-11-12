# Decision: check that the Windows installer ships the sandbox helper and srt-win.exe

- Task: HAL-1451 (S1: set up the agent sandbox from the installed app)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-1451](/HAL/issues/HAL-1451)
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the `installer-windows` job's list of files the silent install must leave gets two names: `halonic-sandbox-elevate.exe` and `srt-win.exe`. Nothing else in the job changes: same triggers, same read-only rights, no secrets, publishes nothing.

## Why

From this pull request on, `build-installer.ps1` builds the sandbox's elevated helper and puts it and srt-win.exe next to `Halonic.exe`, where the agent host finds the helper. An installer without them would quietly fall back to srt's own elevation, so the job fails instead.

## Covers

- .github/
