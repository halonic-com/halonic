# Decision: halonic run and halonic routines watch record which version a run read

- Requirements: `cli.run-live-version` (`apps/cli/requirements/run-live-version.md`),
  `cli.commands.routines.watch` (`apps/cli/src/commands/routines/requirements/watch.md`)
- Task: HAL-6021, the follow-up to HAL-5173 from Liam's review note there
- Approval: Liam approves this note in his review of this pull request on
  HAL-6021
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4Zpjf3vyzqpL8oQPx7qfomfN/m+rO0TppCeeys5ezUw8tzBEsoC8WoggylUcir94YSEC5nNIFgy+2L2sWxvHAQ==

## What changes

Since HAL-5173 a run's `run.started` can record which version of the workspace it read
(`app.run-records-its-version`), but no command passed one in. Now both do:

- `halonic run` records the version it starts: the live version's commit and date, or the saved
  files with history off. `cli.run-live-version` says so and gains an example.
- `halonic routines watch` records the saved files. The watch loads the saved files once when it
  starts and runs every routine from that snapshot, so the newest commit when a routine is due
  (`LiveRoutines.runVersion`) would name files the run never read.
  `cli.commands.routines.watch` says so and gains an example.

The lines `halonic run` prints don't change. Its `--json` output lists the run's events, so the
`run.started` there gains the `version` field HAL-5173 added to the event: the two `halonic run`
golden files gain those three lines. The run summary in the same output has no such field and
doesn't change.

The parity compare with the old CLI's `studio run` calls (`cli.parity-cli-calls`) then sees the
new field in `run.started`. `allowed-differences.json` gains the proposed entry
`run-started-names-the-version` (requirement `events.run-started-version`), with the CLI rule
`run-started-version` that takes `version` out of the new `run.started` only. Every other field
of the runs is still compared. The entry is signed off in review.

## Tests

No test was weakened. `live-version.test.ts` gains two tests and one more expected field;
`watch.test.ts` checks one more field of the run it already starts. The golden files only gain
the new field. `cli-judge.test.ts` gains a test for the new CLI rule.

## Covers

- cli.run-live-version
- cli.commands.routines.watch
- apps/cli/src/commands/run/golden/support-reply-waiting.txt
- apps/cli/src/commands/run/golden/support-reply-approved.txt
- packages/testing/parity/allowed-differences.json
