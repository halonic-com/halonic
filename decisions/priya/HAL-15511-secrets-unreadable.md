# Decision: the test for a secrets file you can't read is skipped on Windows and as root

- Approval: Liam's review of PR #4727 on HAL-15511 (Paperclip task)
- Kind: internal

## What changes

`unreadable-file.test.ts` is a new test file with one group skipped on some platforms, with `describe.skipIf(...)`. It sets the secrets file's mode to `000` and checks that every call of `FileSecretStore` (`get`, `names`, `set`, `remove`) is refused with "The secrets file … can't be read by you." and the fix `Run chmod 600 …, then run again.`, and that the file keeps its secrets. Windows has no read permission bits, and root reads any file, so the setup doesn't make the file unreadable there. The group is named `[platform:win32] needs POSIX modes:`, like the other platform-split tests. No existing test was removed or weakened. Every other test in the file, including the fix for a file another user owns and the Windows fix, runs on every platform. CI runs the tests on Linux as a normal user, so the group runs there.

## Why

The requirement `secrets-file.unreadable` says a secrets file the person can't read is refused with its cause and fix, never with the file system's own error. A test that is true where the file can be made unreadable, and skipped where it can't, is more exact than a loosened one.

## Covers

- packages/adapters/secrets-file/src/unreadable-file.test.ts
