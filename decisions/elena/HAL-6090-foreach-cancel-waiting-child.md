# Decision: a foreach item's child run that waits is cancelled, not left waiting

- Approval: the engine bug decisions on [HAL-185](/HAL/issues/HAL-185#document-engine-bug-decisions) fix E8; Liam (CTO, core owner) signs off in review on [HAL-6090](/HAL/issues/HAL-6090)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:06I5bXF9nD0HRlfjO8+hMq/M8COW/cA11KKEuCYyq78Lqtge1WnaIfEKZVLkS4kKo+BHgztgeJsGvgHiLWjRDQ==

## What changes

When an item's child run in a `foreach` state waits, the run still fails with the same error.
Now the engine also ends that child, and every other item's child run still going, with
`run.failed` and `reason: "cancelled"`, as `LocalRuns.cancel` would. Before, the child stayed
`waiting` for ever, with no parent that would ever answer it.

## Decisions

- **A kernel effect, `cancel-child`.** The `foreach` state asks for one per item child still
  going, next to its `fail` outcome, so the step stays pure and the test of the state shows it.
  `LocalRuns` carries it out with the steps `cancel` already takes for one run and the child it
  waits on.
- **A child doesn't start under a parent that has ended.** Children that start in the same step
  start one after another; when the first waits at once, the parent fails before the next one
  starts, so cancelling it would find nothing. `LocalRuns` now skips a `start-child` whose parent
  has ended.
- **Only the waiting case.** A failing item still lets the others end on their own, as the spec
  says; the other half of E8 (items ignoring `method`, `gets` and `format`) goes with HAL-4757.
- **No parity fixture covers it.** The one foreach-over-a-workflow fixture fails its child rather
  than waiting, so no allowed difference is added.

## Tests changed

`states/foreach/workflow-items.test.ts`: the waiting test also checks the `cancel-child` effects.
`run/local-runs-foreach.test.ts`: two tests, an item child still running and one started in the
same step, check that no child is left `waiting`. No test was weakened or removed.

## Covers

- engine.foreach-workflow-items
