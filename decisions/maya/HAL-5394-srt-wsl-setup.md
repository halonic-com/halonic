# Decision: the WSL setup host may start wsl.exe, reg.exe and PowerShell

- Task: HAL-5394
- Approval: Liam approves this note in review on HAL-10558; the change is built in HAL-5394
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:zo/+tn8YUrkdL3pt+O/Ive+yVa7QphlAGLu9F332LggYlCiqqoA2as9yYnfcaktmk0/CFck6YW4aEgTapZugBw==

## What changes

`tooling/check/process-starters.json` gets one entry, for
`packages/adapters/sandbox-srt/src/wsl-setup/system-host.ts`. Nothing else in the guard changes.

## Why

On Windows, the srt-wsl setup installs WSL, imports Halonic's distro and resumes after a restart
(HAL-5394). For that the host starts `wsl.exe`, `reg.exe` and `powershell.exe`, all joined onto
`%SystemRoot%\System32`, through `execFile` with no shell. Every argument is a literal or comes from
the setup: the distro's name and folder, the image path, the one RunOnce command Studio gave, and the
program for `runInDistro`. PowerShell runs two fixed scripts: the start-time query and the elevated
start of `wsl.exe` with literal arguments.

## Tests

`system-host.starts.test.ts` checks that the started programs are exactly these three, from
System32. No test was weakened or skipped.

## Covers

- tooling/check/
