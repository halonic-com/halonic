# contracts.meter

- Status: active
- Since: unreleased
- Source: HAL-18024; HAL-13219; `Meter` port (`engine.meter-port`)

Where a backend implements `Meter`, it shall hold an organisation's members to the pool, a member to their share of it, and the organisation to its cap on runs at once, and refuse someone the organisation no longer lists with `plan.member-removed`. `check` shall record nothing. `reserve` shall count what a step holds back against every later step until the step is settled, refuse a step whose maximum doesn't fit with `phase: reserve`, `needed` and `left`, and never hold back more than a limit when steps reserve at once. `settle` shall let go of what the step held back and count its harness time. `record` shall count a model call's step, its input and output tokens and its cost, nothing for an answer from the cache, and a run's end against the runs. A refusal shall name the unit, what is used, the limit and when the period resets.

## Examples

- Given a pool of 10 in cost and a model call that cost 10,
  when a member checks for a model call,
  then it is refused with `plan.cost`, used 10 of 10, until the month ends.
- Given a pool of 10 in cost and a step that holds back 6,
  when another member reserves 6,
  then it is refused with `plan.cost`, needed 6 and left 4.
- Given a cap of one run at once and one run going,
  when another member checks for a run start,
  then it is refused with `plan.concurrency`, and a model call is still allowed.
