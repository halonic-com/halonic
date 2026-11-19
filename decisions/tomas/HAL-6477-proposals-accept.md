# Decision: a decision on a proposal holds the run's record lock, and the engine settles expired proposals at start

- Approval: HAL-12841 (Liam's review of #3747, which asked for this note)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:noH0vS8eYwz1gWXYeiaTK0B5pUoJYZf8tZedawJZs+hEpU1nxe1amkkwoFWOTSva2YMrJ6/QGNAeOqrH6nNlAw==

## What changes

`app.run-proposal-record-lock` is new. The proposal service reads and writes a run's record in the
run's turn, as before. When the host gives it a `ProposalRecordLock`, it also holds that run's lock,
taken after this process's turn so it never waits on itself. `fs-node.proposal-record-lock` is new
too: `folderRecordLock` in `@halonicjs/adapter-fs-node` is that lock for records in a folder, one
file per run, `<run-id>.lock` beside the records in the profile, held with `holdLock`. It waits up
to 30 seconds for another process's decision, then fails naming that process. Every host that opens
these records takes it: the CLI's engine and `halonic proposals` (`localProposalParts`), and
Studio's agent host (`agent-host.proposal-record-lock`, new), which writes the same records when
Studio opens, ends or clears a run's folder.

Two requirements from #3747 get more text, as Liam asked in his review of it. `app.run-proposal-list`
gets an example: a record that can't be read isn't listed. That was already the rule, it only had no
example. `cli.commands.proposals.show` now prints git's `\ No newline at end of file` line, so a
change to only the final newline shows; it ends with how to accept or discard while a file is left
to decide; and a proposal whose texts were deleted outside Halonic says how to remove it, now that
`discard` exists.

Nothing existing is removed or weakened. A host that passes no lock keeps the old behaviour: only
its own turns keep the work on a record apart. No test is changed, skipped or deleted.

## Why

`halonic proposals` opens no engine and takes no engine lock, so it works while `halonic routines
watch` runs. `expected` keeps the workspace's files safe, but not the proposal record. A decision
reads the record and writes it back, and the run's turn only queues work inside one process. So two
deciders in two processes could both read the record, and the second write would drop the first
decision. A new test shows this: with a lock that does nothing, two Accepts at once keep only one.
The Undo steps and settle both read `decisions`, so a lost decision isn't harmless. (Liam's option
1 on HAL-12841. Option 2, arguing it is harmless, doesn't hold.)

The lock is per run, not the engine lock and not one per folder. Deciding one proposal never waits
on another, and `routines watch` never blocks the command. The lock lives in `@halonicjs/adapter-fs-node`, next to `holdLock`, so the CLI and Studio's
agent host use the same one. It is `holdLock`, not `withRunLock`. A
run lock counts as stale after 10 seconds even while its holder runs, and a decision can take
longer than that when git starts cold. `holdLock` renews itself, and the lock of a process that has
ended is still taken over at once. If the lock is lost anyway (the process stalled past the stale
limit), the work's result isn't given. The command fails and says another process may have decided
at the same time.

**Where `settleExpired` runs.** The engine runs it once at start, in the harness host's `start`,
and `routines watch` runs it once a day. That comes in the next PR, `tomas/HAL-6477-harness-run`.
This is the one time the engine writes a proposal record after its run has ended. Without the lock,
"the engine never touches a proposal record again once the run has ended" would be wrong. With the
lock it doesn't matter: the engine settles under the same lock as the command, so neither drops the
other's write. The command doesn't settle expired proposals itself. `halonic proposals` reads, and
accept and discard settle only the proposal they decided.

## Covers

- agent-host.proposal-record-lock
- app.run-proposal-list
- app.run-proposal-record-lock
- cli.commands.proposals.show
- fs-node.proposal-record-lock
