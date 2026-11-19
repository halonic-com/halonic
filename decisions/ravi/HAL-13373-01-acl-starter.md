# Decision: the MXC box folders' base may start `whoami` and `icacls` to get its own access list

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13373
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:VYeETdn7WYIhqRppWgA985QfN/fSvW3IdJfSHrP0DdaVkjjzzWXStKDa+MdEP7VwPCZ8v1DWFuyuVbLNxit0Cw==
- Task: HAL-13373

## What changes

`tooling/check/process-starters.json` gains one entry:
`packages/adapters/sandbox-mxc/src/own-access-list.ts`, with
`packages/adapters/sandbox-mxc/src/own-access-list.starts.test.ts` as its scripts test.

The entry merges first and the code follows in its own pull request, as `docs/guides/checks.md`
asks: CI runs `process-starts` with the base commit's list, so the entry has to be on `main`
before the file that needs it (the rule only warns while the file doesn't exist).

## Why

On a real Windows 11 PC, MXC failed in every folder that inherited its access list from the
user's `AppData`, while `%LOCALAPPDATA%\Temp`, which has its own, passed (HAL-3503, grant rule 6
as revised). `BoxFolders` puts the box folders under `%LOCALAPPDATA%\halonic\mxc-boxes`, which
inherits from `AppData`. So the base folder gets its own access list, the way Windows sets up
`Temp`: inheritance off, and Full Control for only the current user, SYSTEM and Administrators.
Node has no API for a Windows access list, so the file starts the system's own tools, as
`sandbox-srt/src/journal-acl.ts` already does.

The new starter runs on Windows only. It starts only `whoami.exe` and `icacls.exe` from
`%SystemRoot%\System32`, never from the `PATH`, with no shell and fixed arguments: the folder
`BoxFolders` made in Halonic's data folder and the SIDs of the user, SYSTEM and Administrators.
It never starts a file under a skill's `scripts/` folder; the scripts test shows it with a fake
`child_process`, so nothing runs.

No rule, test or threshold is changed.

## Covers

- tooling/check/
