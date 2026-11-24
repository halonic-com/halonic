# Decision: a run records its task, and an agent how its harness session began

- Requirements: `events.run-log-contract` (`packages/core/events/requirements/run-log-contract.md`),
  `events.run-started-task`, `events.agent-started-session`, `events.usage-rollup`,
  `engine.run-records-its-task`
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17254 (token phase 1e; the board's yes on
  HAL-16897 to the direction on HAL-16892)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JcG42xtAeXFW1kSGCAfpxA3aZMnCPQz1PQ1FZzzSc71upq8jMyGjZLfPshhAGnSXwCbF7rX2ma4c4ruqqWO8BA==

## What changes

`run.started` gains an optional `task`, `{ id, branch? }`: the task the run worked on, as the caller
names it, and the branch that stands for its pull request. There is no task model yet; the id is a
string nothing looks up. `agent.started` gains an optional `session`, `{ start: "fresh", reason }`
or `{ start: "resumed" }`, which the harness bridge of phase 1a fills in. Logs without either read
as before.

`events.run-log-contract`: its third example listed "the twenty-seven fields that come with the
engine". It now lists twenty-nine, with `run.started.task` and `agent.started.session` and their
requirements. No reference field changes.

Three requirements are new besides the two field ones: `events.usage-rollup` (`runUsageOf`,
`usageByTask`, `usageByBranch`) and `engine.run-records-its-task` (the engine records a start's
`task`, and a child run its parent's).

`RunState` gains `task`, so the engine's snapshot version moves from 10 to 11: older snapshots are
folded from their logs again.

## Tests

No test was weakened. The `run.started` and `agent.started` type tests gain the optional fields,
marked as added after the reference. The run-state fold test's expected state gains `task: null`.
The new requirements have their own tests in `run-started-task.test.ts`, `usage-rollup.test.ts`
and `local-runs-task.test.ts`.

## Covers

- events.run-log-contract
