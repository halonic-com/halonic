# Decision: two file tool approval store tests skip on Windows

- Approval: Paperclip task HAL-6201 (Liam's review of halonic#1928, for HAL-2210)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3fJhIo1r7rbo9gH/pCxlE4o7NFFBl3CZ9WkdLnjojV9ZE6tpzCcEpCXAbrLvrZEz87PpMeuOtUJkd5W6aAOHBw==

`tool-approval-store.test.ts` is a new test file for `FileToolApprovalStore`. Two of its tests
check something Windows doesn't have, so they are `it.skipIf(process.platform === "win32")`, as
other `fs-node` and `mcp` tests already do:

- `makes the folders and the files private to the user` checks the POSIX modes 700 and 600.
  Windows has no such modes; Node reports made-up ones there.
- `is refused behind a link too` makes a symbolic link, which a Windows user without developer
  mode can't. The check it tests, real paths on both sides, also runs in `is refused, so a
  workspace can't arrive with its tools approved`, which runs everywhere.

Nothing existing is skipped, removed or weakened.

## Covers

- packages/adapters/fs-node/src/tool-approval-store.test.ts
