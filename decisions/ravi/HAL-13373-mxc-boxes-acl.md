# Decision: the MXC box folders' base gets its own access list

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13480 (security review of this change); the reviewer approves this note by signing it
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:pwaAKB8BugNoYYJi4861dVhbZ7trMF0XpfJ4sRqpsQ045/rPLqUSQOAaHVncQsTvxcx/nse5mYfw6LCObOFnBQ==
- Task: HAL-13373

## What changes

- The requirement `sandbox-mxc.box-folders` gains one rule: before a process makes its first box
  folder, the adapter gives the base folder `mxc-boxes` its own access list, the way Windows sets
  up `Temp`: inheritance off, and Full Control for only the current user, SYSTEM and
  Administrators. The box folders inside inherit it. This also happens when an older Halonic
  already made the base folder, and no box folder is made when it fails.
- Two examples are added for those cases, and the source line names HAL-13373 and the revised
  grant rule 6 of HAL-3503.

## Why

On a real Windows 11 PC, MXC failed in every folder that inherited its access list from the
user's `AppData`, and passed in `%LOCALAPPDATA%\Temp`, which has its own (HAL-3503, grant rule 6
as revised). The base folder sits under `%LOCALAPPDATA%\halonic`, so it inherited from `AppData`.
The new access list grants the same accounts `AppData` does, so access only gets narrower.

How the access list is set (fixed System32 `whoami.exe` and `icacls.exe`, no shell) is in
`HAL-13373-01-acl-starter.md`, which added the process starter.

## Tests

`own-access-list.test.ts` covers the arguments, Halonic running as SYSTEM, and a user SID that
can't be read. `box-folders.test.ts` covers a base folder that was already there, and that no box
folder is made when it fails while the next one tries again.
`own-access-list.starts.test.ts` shows only the two System32 programs start.

## Covers

- sandbox-mxc.box-folders
