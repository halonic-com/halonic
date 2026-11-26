# Decision: three ledger file tests skip on Windows

- Task: HAL-19486
- Approval: Liam approved these Windows-only skips in his review of #6473 on HAL-19486 (https://paperclip.halonic.com/HAL/issues/HAL-19486), 26 November.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:CAkgqXKGsPm6lWrdB3jayFThJBvAHHrVuqc2Ae8e6eFy6Hd1cSIUx6JPvatL/3UTPXDt/0ogUndgAj3tnaE3Bg==

## What changes

`packages/adapters/fs-node/src/approval-ledger-store.test.ts` is a new file. Three of its tests skip
on Windows only, with `[platform:win32]` in their names, as the store's other POSIX tests already do:

- the file and its folder are private (modes 600 and 700);
- a symbolic link in the file's place is refused;
- a named pipe in the file's place is refused rather than waited on.

They run on Linux and macOS, and the rest of the file runs everywhere, including the hard-link test.
No existing test is skipped or weakened.

## Why

Windows has no POSIX file modes (HAL-4365), creating a symbolic link needs extra rights, and it has no
named pipes in the file system. On Windows the hard-link test still proves the store's link guard
refuses a second name for the file.

## Covers

- fs-node.approval-ledger-file
- packages/adapters/fs-node/src/approval-ledger-store.test.ts
