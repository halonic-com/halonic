# Decision: list the WSL setup's process starter in the process-starts guard

- Task: HAL-5394 (the WSL setup), reviewed on HAL-10573
- Approval: [HAL-10573](/HAL/issues/HAL-10573), Liam reviewed the entry on HAL-10572 and HAL-10573
- Kind: internal

## What changes

`tooling/check/process-starters.json` gets one entry for
`packages/adapters/sandbox-srt/src/wsl-setup/system-host.ts`, the file that will start
`wsl.exe`, `reg.exe` and `powershell.exe` on Windows when the WSL setup lands in the next
pull request. The entry says why each program starts and where its test lives. It is the same
entry as in the pull request that adds the file, split out so it is reviewed and merged first.

No requirement, test or golden file changes. The guard counts any change under `tooling/check/`
as a change to its own paths, so it needs this note. The process-starts guard warns that the
file doesn't exist yet. That is expected until the next pull request.

## Covers

- tooling/check/
