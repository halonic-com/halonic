# Decision: check that the Windows installer ships the sandbox helper and srt-win.exe

- Task: HAL-1451 (S1: set up the agent sandbox from the installed app)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-1451](/HAL/issues/HAL-1451)
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the `installer-windows` job's list of files the silent install must leave gets two names: `halonic-sandbox-elevate.exe` and `srt-win.exe`. Nothing else in the job changes: same triggers, same read-only rights, no secrets, publishes nothing.

## Why

From this pull request on, `build-installer.ps1` builds the sandbox's elevated helper and puts it and srt-win.exe next to `Halonic.exe`, where the agent host finds the helper. An installer without them would quietly fall back to srt's own elevation, so the job fails instead.

The helper inside the install must be signed for a release: its UAC prompt shows the publisher, and its check of its own copy for Installed apps relies on it. The release signs only the setup .exe today, and doesn't build Studio yet. So `build-installer.ps1` refuses to pack the helper when a publisher is built in (`HALONIC_SANDBOX_SIGNER`, set only by a release) and the helper isn't validly signed by it. Signing it before it is packed is [HAL-7491](/HAL/issues/HAL-7491), which blocks any release that ships Studio (Liam's review on [HAL-7386](/HAL/issues/HAL-7386)). CI builds set no publisher, so this job is unchanged by it.

## Covers

- .github/
