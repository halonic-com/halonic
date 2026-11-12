# Decision: the installer job walks the run-again page

- Task: HAL-1202
- Approval: Liam approves this note in review on [HAL-1202](/HAL/issues/HAL-1202)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BEvuMVcFmmavU2FFqXm4/uFUP9sdyU9wW7Mtq1x9Kr6HVQpiotFUoymcSk0Aqn1WypQvVYvUHHfEv5o9qNodCg==

## What changes

In `.github/workflows/ci.yml`, the `installer-windows` job gets one new step, which runs `apps/studio/src-tauri/windows/test-run-again.ps1` against the installed Halonic. Its pictures go into the `halonic-installer-messages` artifact that the step before it uploads. No other job, trigger or permission changes.

## Why

Running the installer again with the same version now opens our run-again page (flow 2.5). The CI job is the only place it runs on Windows. The step checks that **Continue** is disabled while no box is ticked, that **Continue** without Repair copies nothing, and that Repair copies Halonic again. Both runs end on the finish page.

## Tests

No test was skipped or weakened. The step only adds checks.

## Covers

- .github/
