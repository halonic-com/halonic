# Decision: `plugin list` names a plugins folder it can't read, and exits 7

- Task: HAL-15791
- Approval: HAL-15791 (flow check C627 B1 on HAL-15779; the wording follows `google reset`'s refusal of a folder it can't read from #4848, decided by the team under the HAL-2282 rule). The reviewer signs this note at code review.
- Kind: user-visible

## What changes

When the profile's plugins folder is there but can't be read, such as after `chmod 000`,
`halonic plugin list` said "Halonic ran into a problem it can't explain yet." and exited 1. That is
the case `halonic doctor` points to with "can't be read or checked … See halonic plugin list." Now it
lists nothing, names the folder, says to check that you can read it, and exits 7 (`denied`).

The active requirement `cli.commands.plugin.list` gains this sentence and an example. Nothing it
promised before changes: a single plugin folder that can't be read is still listed with ✕ and
doesn't stop the others.

`list.test.ts` gains one test for it, skipped on Windows and as root with `it.skipIf(...)`:
Windows has no read permission bits, and root reads any folder whatever its mode, so `chmod 000`
doesn't make the folder unreadable there. The test is named `[platform:win32] needs POSIX modes:`,
like the other platform-split tests. CI runs on Linux as a normal user, so it runs on every pull
request. No test was removed or loosened.

## Why

Doctor's pointer has to lead to an answer (E2: every refusal says what to do next). Exit 7 and the
two-line shape match the other commands that refuse a folder they can't read.

## Covers

- cli.commands.plugin.list
- apps/cli/src/commands/plugin/list.test.ts
