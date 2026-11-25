# engine.plan-limit-wait

- Status: active
- Since: unreleased
- Source: HAL-13220, Owen's plan approved with changes by Liam; the selling layer's design (HAL-12483), section 11 (G7); builds on `engine.meter-checks`, `engine.plan-stops` and `events.run-limit-waiting`

When a meter is set and a step decides on a model call or a harness run that the meter refuses with a unit's limit, `plan.<unit>` or `plan.member.<unit>`, the run shall wait for `continue` instead of failing: the engine shall store a `run.limit-waiting` with the stop and none of the refused decision's events, so the run stays as it was before it, and make no call. A starting run shall keep its `run.started` and nothing else.

- On `continue`, the engine shall decide the refused input again from that state, so the step always starts from its beginning, and ask the limits again for the run's own principal, never for whoever sent `continue`. When they allow, the run shall go on. When the meter answers a unit's limit again, the run shall keep waiting with that stop, until the same time. When a final stop is reached, the run shall fail with it.
- These stops shall stay final, with `run.failed` and the reason `budget`: `budget.run`, `budget.month`, `plan.none`, `plan.suspended` and `plan.member-removed`. A step's own limits (`harness.max-*`) never wait. When a unit's limit and the monthly budget are both reached, the run shall fail with `budget.month`.
- A customer who isn't active gets `plan.suspended`: a waiting run they continue fails, and a running run fails at its next paid step.
- A waiting run nobody continues shall fail with the reason `budget` and the stop's cause 7 days after it started waiting, through one `Scheduler` timer. A timer delivered after `continue` shall change nothing.
- A waiting child run shall not tell its parent, which stays running; `continue` goes to the child.
- `plan.concurrency` comes only from the check before a run starts, where no run exists that could wait: it stays a refusal. A model call cut off partway by a reservation is left to the reservation work.

## Examples

- Given a meter that refuses model calls with `plan.cost` (or `plan.member.cost`),
  when a `reply` run starts,
  then it waits for `continue` with that stop, its log holds only `run.started` and `run.limit-waiting`, no model is called, and a timer is set 7 days later.
- Given a run that waits at `plan.cost` after its first step and a meter that now allows,
  when `continue` is sent,
  then the refused step starts from its beginning and the run completes.
- Given a run that waits at `plan.cost` and a meter that still refuses,
  when `continue` is sent,
  then it waits again with the same stop and until, and no model is called.
- Given a meter that refuses with `plan.none`, `plan.suspended` or `plan.member-removed`, or a run or monthly budget that is reached,
  when a `reply` run starts,
  then it fails with the reason `budget` and that cause.
- Given a meter that refuses with `plan.cost` and a monthly budget that is reached,
  when a `reply` run starts,
  then it fails with `budget.month`.
- Given a run that waits at `plan.cost` and a customer who is no longer active,
  when `continue` is sent,
  then the run fails with `plan.suspended`.
- Given a running run whose customer stops being active after its first step,
  when its next step asks for a model call,
  then it fails with `plan.suspended`.
- Given a run that waits at `plan.cost`,
  when its timer comes due and nobody continued it,
  then it fails with the reason `budget` and `plan.cost`; after `continue`, the same timer changes nothing.
- Given a run in an organisation's scope,
  when `continue` is sent,
  then the meter is asked for the principal of the run's top-level run.
- Given a parent run whose child run waits at `plan.cost`,
  when the child waits,
  then the parent stays running, and `continue` sent to the child lets both complete.
