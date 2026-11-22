# Decision: the run tests for a secrets file you can't read are skipped on Windows and as root

- Approval: Liam's review of the pull request on HAL-15693 (Paperclip task)
- Kind: internal

## What changes

Two test groups set the profile's secrets file to mode `000` and are skipped where that can't make it unreadable, with `describe.skipIf(...)` and `it.skipIf(...)`:

- in `unreadable-file.test.ts`, a new group checks that the store's refusal carries the cause `secrets.file-unreadable` with the file and the fix `chmod`;
- in `apps/cli/src/commands/run/secrets-file.test.ts`, two new tests run `halonic run` with that file and check the two failure lines, exit 7 and the cause in `--json`.

Windows has no read permission bits, and root reads any file, so the setup can't make the file unreadable there. Each skipped group is named `[platform:win32] needs POSIX modes:`, like the other platform-split tests. No existing test was removed or weakened. The tests of the cause for a file another user owns, of the Windows fix, of the app's facts and of the CLI's words for all three fixes run on every platform. CI runs the tests on Linux as a normal user, so the skipped groups run there.

## Why

The requirements `secrets-file.unreadable-cause` and `cli.run-secrets-unreadable` say a run stopped by a secrets file the person can't read logs that cause, and `halonic run` words it with the fix instead of asking for a bug report. A test that is true where the file can be made unreadable, and skipped where it can't, is more exact than a loosened one.

## Covers

- packages/adapters/secrets-file/src/unreadable-file.test.ts
- apps/cli/src/commands/run/secrets-file.test.ts
