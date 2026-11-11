# Decision: on start, the engine cancels a waiting child run whose parent has ended

- Approval: Liam (CTO, core owner) signs off in review on [HAL-6142](/HAL/issues/HAL-6142), the follow-up he asked for in his review of #1908 ([HAL-6133](/HAL/issues/HAL-6133))
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:TzCySc/LF+Co+pWVuPFL27fcZzykL9W4TjMf531gpFNNElnFGBCs+KVK2y79dJdXwjru3Ji+3aCUdxBnF+G6AA==

## What changes

`engine.end-interrupted-runs` said the engine leaves every `waiting` run as it is on start. One
kind of waiting run is never answered: a child run whose parent ended, when the engine stopped
after the parent's `run.failed` was written and before `LocalRuns` cancelled the child (the
`cancel-child` effects of #1908, or the second write of a cancel). It stayed `waiting` for ever.
Now the engine ends it on start with `run.failed`, `reason: "cancelled"`. The requirement gains
"except a child run whose parent has ended", and the new `engine.end-orphaned-child-runs` says
how.

## Decisions

- **In `endInterruptedRuns`, not in `LocalRuns`.** It is the same "the engine stopped part way"
  clean-up, it runs at the same moment, and the runs it ends go through the same steps after it
  (feed, parent timer, folder). `local-runs.ts` is at the 500-line limit and is reworked by
  #1895 and #1901 (HAL-5214), so this change stays out of it.
- **Found from the list of waiting runs.** Each listed child is checked against its parent's log,
  and against its own log when it is ended, as for running runs, so a list that lags changes
  nothing wrongly. It costs one list and one read per waiting child run on start.
- **Grandchildren too.** The waiting runs are looked at again until a pass ends none, so a chain
  is ended whatever order the list gives.
- **The error.** "The run that started this one ended, so this one was cancelled." is the text
  #1901 gives a child cancelled when its run ends. Whichever of the two lands second keeps one
  constant for it.
- **No harness calls to stop.** On start no harness call of this engine is going on, so ending
  the run in its log is all `cancel` would do.

## Tests changed

`run/end-interrupted-runs.test.ts`: three new tests for `engine.end-orphaned-child-runs`; the test
"leaves waiting runs and ended runs as they are" still passes unchanged.
`run/local-runs-child.test.ts`: one new test that writes the parent's end, starts a new engine on
the store and checks the child is cancelled. It fails without the change. No test was weakened
or removed.

## Covers

- engine.end-interrupted-runs
- engine.end-orphaned-child-runs
