# Decision: each Studio preview build gets its own, higher version

- Approval: the task asks for this change (HAL-18308); Liam approves and signs this note in review
- Kind: internal

## What changes

`.github/workflows/studio-preview.yml`, the hand-run unsigned Windows preview build, now builds the
installer as `<next patch>-preview.<run number>` (from `apps/studio/src-tauri/windows/preview-version.mjs`,
passed through `build-installer.ps1 -Config`). It also packs an installer with the release version
from the same build, installs that one first, updates it silently with the preview, and fails
unless Installed apps shows the preview's version and Halonic starts.

Triggers, rights, runners, secrets and the artifact are unchanged. Release builds keep the version
in `tauri.conf.json`.

## Why

Every preview was built as `0.1.0`, so a newer preview found the same version installed and the
installer offered to run again (repair) instead of updating.

## Tests

`apps/studio/src/studio/installer-preview-version.test.ts` (`studio.installer-preview-version`). The
workflow ran on this branch: `0.1.0` installed, then updated silently to `0.1.1-preview.8`.

## Covers

- .github/
