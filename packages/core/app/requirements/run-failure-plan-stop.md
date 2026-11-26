# app.run-failure-plan-stop

- Status: active
- Since: unreleased
- Source: HAL-16571 (C724-3 on HAL-16565: a run a meter stopped read as a failure Halonic can't explain, with a bug report as its fix; decided by the team on the task); builds on `engine.plan-stops` and `app.run-failure`; the stop's own facts added in HAL-14163 (`app.run-plan-stop`)

When a run fails `budget` and the cause of its `run.failed` is a meter's stop, a `limit_reached` cause whose code starts with `plan.` (requirement `engine.plan-stops`), the app shall give the facts `error` with the engine's own message and say its cause is known, so a client shows the engine's sentence and doesn't ask for a bug report. When the stop's own facts read (requirement `app.run-plan-stop`), the facts shall also hold them as `plan`. A `budget` failure with any other cause, or none, shall keep its `budget` facts.

## Examples

- Given a run that failed `budget` with the error `Plan limit reached: 5 of 5 EUR used.` and the cause `plan.cost`,
  when its facts are read,
  then they are `error` with that message, its cause is known, and `plan` holds the stop's facts.
- Given a run that failed `budget` with the cause `plan.member.cost`, `plan.concurrency`, `plan.none`, `plan.suspended` or `plan.member-removed`,
  when its facts are read,
  then they are `error` with the engine's own message, and its cause is known; `plan` holds the stop's facts when they read.
- Given a run that failed `budget` with the cause `budget.run`, a limit of 5 and 5.08 EUR spent,
  when its facts are read,
  then they are `budget` per run with those figures.
