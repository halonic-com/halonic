# Decision: the shell takes its engine lock again after sleep, and git reads the system config

- Approval: the task asks for these changes (HAL-16342); Liam approves and signs this note in his review
- Kind: user-visible

Two requirements of the desktop shell change.

## `studio.src-tauri.crates.run-lock.held-lock`

A held lock older than the stale limit that still holds the shell's own
record is now removed and taken again with an exclusive create, instead of
given up. It is reported lost only when another process holds it by then.

Why: after the computer slept for more than 10 seconds the shell missed its
renewals, gave up its own lock and stopped its engine, and the page said
another Halonic took the workspace's runs over, though none had. A lock that
still holds the shell's record was not taken over, because taking a lock over
replaces its record. Taking it again with an exclusive create is how any
process takes a free lock, so a CLI that is taking the stale lock over at the
same moment either gets it first (the shell then reports it lost, as before)
or finds the shell's new, fresh record and refuses it. Its removal of the old
record leaves the new one alone, because it removes only the text it read.

The example "wasn't renewed for longer than the stale limit … removes the
lock and reports it lost" is replaced by two: the lock is held again, and a
process that creates it first keeps it. The test for the old example is
replaced by tests for both.

`holdLock` in `fs-node` (the CLI) still gives such a lock up; that is its
own task.

## `studio.src-tauri.crates.git-guard.git-hardening`

The runner no longer sets `GIT_CONFIG_NOSYSTEM`, so git reads the system
config as it reads the user's global config.

Why: Git for Windows keeps the credential helper, `core.autocrlf` and the
git-lfs filter in its system config, and Homebrew's git keeps the credential
helper there. Without it, signing in to push fails with no prompt, and a
working tree checked out with CRLF line ends shows every file as changed.
Only the person or an administrator can write the system config, never the
opened folder, so it is as trusted as the global config the runner already
reads. Every hardening key is still given in the environment, which beats
both files, and the repository's own config is neutralised as before. The
`trace2.*Target` row of `docs/config-keys.md` now gives that reason.

The test that expected `GIT_CONFIG_NOSYSTEM=1` now expects it unset.
An export (`git-export`) still reads neither file: its command sets
`GIT_CONFIG_NOSYSTEM=1` itself, next to `GIT_CONFIG_GLOBAL=/dev/null`, and its
test still expects both.

## Covers

- studio.src-tauri.crates.run-lock.held-lock
- studio.src-tauri.crates.git-guard.git-hardening
