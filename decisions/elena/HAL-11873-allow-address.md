# Decision: the test for a profile that can't be written is skipped on Windows and as root

- Approval: the UX checklist on HAL-11873 (Paperclip task) and Liam's decision on HAL-11931
- Kind: internal

## What changes

`allow-address.test.ts` has one test that is skipped on one platform, with `it.skipIf(...)`. It makes the profile's secrets file read-only (`chmod 0o444`) and checks that `halonic models allow-address` shows the "Couldn't read the addresses saved for this key. Nothing was changed." row and leaves the addresses as they were. Windows has no read permission bits, and root writes any file, so the setup doesn't make the file unwritable there. The test is named `[platform:win32] needs POSIX modes:`, like the other platform-split tests. No existing test was removed or weakened. Every other test in the file runs on both platforms.

## Why

The requirement `cli.commands.models.allow-address` says a profile folder whose secrets file can't be written is refused with the key's addresses unchanged. A test that is true where the file can be made read-only, and skipped where it can't, is more exact than a loosened one.

## Covers

- apps/cli/src/commands/models/allow-address.test.ts
