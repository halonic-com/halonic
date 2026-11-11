# Decision: the installer job tests the "Halonic is open" and "newer Halonic installed" messages

- Task: HAL-1202
- Approval: Liam approves this note in review on [HAL-1202](/HAL/issues/HAL-1202)
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the `installer-windows` job gets one new step, which runs `apps/studio/src-tauri/windows/test-messages.ps1` against the installed Halonic. The job also uploads that step's pictures as the `halonic-installer-messages` artifact. No other job, trigger or permission changes.

## Why

The installer now stops before page 1 when Halonic is open or a newer Halonic is installed (flow 2.5). Both stops are message boxes, and the CI job is the only place they run on Windows. The step checks that Cancel quits without closing Halonic, that Retry asks again or goes on, and that an older installer quits, with or without pages, without touching the installed files.

## Tests

No test was skipped or weakened. The step only adds checks.

## Covers

- .github/
