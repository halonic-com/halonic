# Decision: google reset names a folder it can't read, and exits 7

- Approval: HAL-15735, from Nina's flow check C619 on HAL-15724; wording and an exit code on an approved command, decided by the team under HAL-2282
- Kind: user-visible
- Task: HAL-15735

## What changes

`cli.commands.google.reset` grows one case: when the `google` folder or the integrations' sealed
sign-ins are there but can't be read (EACCES, EPERM, or a file where the folder belongs), it asks
nothing, removes nothing and exits 7 (`denied`) with "✕ Couldn't reset Google: Halonic can't read
the folder <folder>, so it can't tell what's in it. Nothing was removed." and the fix "Check that
the folder belongs to you and that you can read it, then run halonic google reset again." One
example is added; no example was removed or weakened.

`apps/cli/src/commands/google/reset.test.ts` adds one platform skip: the new `chmod 000` test can't
run on Windows, which has no POSIX read bits, or as root, which reads every folder. It runs on Linux
and macOS.

## Why

Before, it said "Couldn't remove them: Halonic ran into a problem it can't explain yet." and exited
1: "them" named nothing, a permission error is a known cause rather than a bug, and exit 1 is also
what answering No gives, so a script couldn't tell the two apart. Exit 7 is what the CLI already
gives when permissions refuse a write.

## Covers

- cli.commands.google.reset
- apps/cli/src/commands/google/reset.test.ts
