# Decision: a run that asks "Allow this address?" shows Needs you on its row, in Studio and in `halonic runs`

- Task: HAL-15831
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15831 (flow check C638 #5 on HAL-15825; Liam approved the plan on HAL-15831, including that the CLI matches Studio; small wording on the approved "Allow this address?" flow, decided by the team under HAL-2282, no board card); the reviewer signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:glpHB8W6QCIAm3hU5zQEm7zSozDbJMh+yAGN3Ieysf6/i7130L+ys8Kz2WGQSnE+2bhX8xxHHk0RTj4wePtjAQ==

## What changes

1. `events.summary-key-origin-asked` (new): a run's summary holds the questions "Allow this address?" still open,
   oldest first, in an optional `keyOriginAsked`, and leaves the field out when none is open. The rule that opens
   and closes a question is the one #4909 gave the run page (`runs.run-view.key-origin-waiting`), moved here so
   the run page, the Runs list and the CLI read one copy of it; it also closes every question when the run ends.
   The field is optional so older summaries and the many summaries built in tests stay valid; `runs show --json`
   has it only while a question is open.
2. `app.run-standing` (changed): a running run with an open question needs you, as one with an open approval
   does, and `runWait` gives it as a new kind `address` with the oldest question, after open approvals and before
   anything else. Before, such a run was simply running.
3. `runs.row` (changed): its row reads Needs you with a dot and the line
   "Waiting for your answer in the step Draft", in the form of "Waiting for your approval in the step Draft".
   Home's Recent runs uses the same row. `halonic runs` says the same in its What column, with a line in
   `apps/cli/README.md`.

Also follows from `runStanding`: the screen reader's change sentence says
"Run 01jd8q needs you. Waiting for your answer in the step Draft." and, once answered, that it is running again;
the run page shows no banner for it (the dialog that asks is open, and the step already says
"Waiting for your answer"); `runs show` adds no answer lines, since the answer is given in Studio. The sidebar's
running count no longer counts such a run, as for a run with an open approval.

No test is weakened: the run page's existing tests of `runs.run-view.key-origin-waiting` pass unchanged through
the summary, and the rule's own cases are now tested in `@halonicjs/events`. `apps/cli/src/commands/runs/listed-run.test.ts`
runs fewer tests because it would have grown past the 480-line headroom: its tests of waiting and Needs you rows
moved unchanged to `listed-run-waits.test.ts`, next to it, and its setup to `apps/cli/src/test/listed-run-fixtures.ts`. The question hasn't been released,
so there is no changeset.

## Covers

- events.summary-key-origin-asked
- app.run-standing
- runs.row
- packages/core/events/src/key-origin-questions.test.ts
- packages/core/app/src/run-standing.test.ts
- packages/studio/features/runs/src/list/run-row.test.ts
- apps/cli/src/commands/runs/listed-run.test.ts
