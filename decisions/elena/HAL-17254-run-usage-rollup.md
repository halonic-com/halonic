# Decision: a run records the task it worked on

- Requirements: `events.run-log-contract` (`packages/core/events/requirements/run-log-contract.md`),
  `events.run-started-task`, `events.usage-rollup`,
  `engine.run-records-its-task`
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17254 (token phase 1e; the board's yes on
  HAL-16897 to the direction on HAL-16892)
- Kind: internal

## What changes

`run.started` gains an optional `task`, `{ id, branch? }`: the task the run worked on, as the caller
names it, and the branch that stands for its pull request. There is no task model yet; the id is a
string nothing looks up. Logs without it read as before.

`events.run-log-contract`: its third example listed "the twenty-eight fields that come with the
engine". It now lists twenty-nine, with `run.started.task` and its requirement. No reference field
changes.

Two more requirements are new: `events.usage-rollup` (`runUsageOf`, `usageByTask`,
`usageByBranch`, which count fresh and resumed harness sessions from `harness.started.session`,
the field phase 1a added) and `engine.run-records-its-task` (the engine records a start's `task`,
and a child run its parent's).

`RunState` gains `task`, so the engine's snapshot version moves from 10 to 11: older snapshots are
folded from their logs again.

## Tests

No test was weakened. The `run.started` type test gains the optional field, marked as added after
the reference. The run-state fold test's expected state gains `task: null`. The new requirements
have their own tests in `run-started-task.test.ts`, `usage-rollup.test.ts` and
`local-runs-task.test.ts`.

## Covers

- events.run-log-contract
