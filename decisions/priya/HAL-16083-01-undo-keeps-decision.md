# Decision: Undo keeps the decision of a file it can't put back

- Requirement: `app.run-proposal-accept` (`packages/core/app/requirements/run-proposal-accept.md`)
- Task: HAL-16083, from Sofia's words check C665 row 31 on HAL-16066
- Approval: Liam approved the behaviour and the per-file record on HAL-16083; he approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:cQoSfZbauS6o2UvYeXgxk6vUeYHm5PAqxwEjjmxa3CWnHook/kTYuJr6km4KZjUSqSoBQO3YuVAYdsVBHhYHDQ==

## What changes

Undo and Redo of a run proposal's step put the files back first, then write the decisions record
file by file. A file written back gets the decision the step brings back. A file left alone,
because the person changed it since or the store won't serve it any more, keeps its decision.
Before, the whole record text was swapped back first, so such a file said "undecided" while it
still held the accepted text.

The check before a restore compares only the step's own files (decision and partly decided
standing) with what the step left, or with what it brings back, for a file an earlier partial
Undo left alone. A later decision on another file of the run no longer keeps the step from being
undone, and that decision stays as it is. A later decision on one of the step's own files still
keeps all of the step from coming back. The answer now says so with `decidedAfter`, so the Inbox
can tell the person why nothing went back.

## Why

A file that stays accepted on disk but reads "undecided" is a dead end: Accept then finds it
changed since the run's base and refuses. And after a partial Undo the record matched neither side
of any step, so a whole-text check would refuse a Redo, or an Undo of the step before, as "decided
after", which isn't true. The step keeps both record texts already, so the history's format
doesn't change.

## Tests

The test "keeps the person's edit and lists the file" now expects the file to stay accepted. The
test for a step whose decisions changed since used a later decision on another file; that no
longer blocks, so it now uses a later decision on the same file, and still checks that nothing is
written and the decision stays. Both make the same number of `expect` calls as before. A new
`run-proposal-restore.test.ts` covers a partial Undo, Redo after it, Undo of the step before it,
a file the store no longer serves, and a later decision on another file and on the same file.

## Covers

- app.run-proposal-accept
