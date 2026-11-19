# Decision: the plugin copy's link and named-pipe tests are skipped on Windows

- Approval: Paperclip task HAL-12343; Liam's review on HAL-12670 asked for the named-pipe test; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wvRAF2jY21ygOEY+Xu2Ko6gvkY8wGnFPqBBFSiKUPKXGERPLd+xZsEvt/fYS+bHr6Y728Tt4SypkTK2mvzbtAA==

## What changes

`plugin-copy.test.ts` is new and has two tests that are skipped on Windows, with `it.skipIf(...)`:

- One swaps a checked file for a link to a file with the same bytes. Making a link on Windows needs admin rights or developer mode, which CI's Windows runner doesn't promise, and `O_NOFOLLOW` doesn't exist there.
- One swaps a checked file for a named pipe made with `mkfifo`, and checks the copy refuses it at once instead of waiting for a writer (Liam's review of halonic#3589). Windows has no `mkfifo`.

Both are named `[platform:win32] needs …:`, like the other platform-split tests. On Windows the same code still refuses anything that isn't a plain file through its `isFile()` check after opening. Every other test in the file runs on all three platforms. No existing test is removed or weakened.

## Why

The requirement `connector-stdio-sandbox.local-tool-plugin-copy` says a checked file that is now a link (on Linux and macOS) or anything else that isn't a plain file is refused, without waiting on a named pipe. A test that runs where the setup can be made, and is skipped where it can't, is more exact than a loosened one.

## Covers

- packages/adapters/connector-stdio-sandbox/src/plugin-copy.test.ts
