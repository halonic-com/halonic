# app.run-plan-stop

- Status: active
- Since: unreleased
- Source: HAL-14163 (S3-11, plan approved by Liam on the task, 26 Nov; takes point 1 of HAL-16574); flows C3 and section 0 (HAL-12484); builds on `engine.plan-stops`, `engine.plan-limit-wait` and `app.run-failure-plan-stop`

The app shall read a meter's plan stop, a `limit_reached` cause whose code starts with `plan.`, into facts a screen words, without words of its own:

- `plan.<unit>` and `plan.member.<unit>`, whose detail names the same `unit` and has `used` and `limit`: a `unit` stop with the unit, whether it is a member's share, the percent used (rounded down, at most 100), `resetsAt` and the plan's name when the detail has them, and whether a bigger plan helps (`canUpgrade: "true"`, never for a member's share). A refused reservation (`phase: "reserve"` with `needed` and `left`) adds the percent needed (rounded up) and the percent left (rounded down). For the `cost` unit, the facts shall hold percentages only and never the amounts, because a customer never reads model cost as money; for any other unit they also hold the amounts.
- `plan.concurrency` with whole numbers `running` and `limit` and a `cap` of `scope` or `member`: a `concurrency` stop with those.
- `plan.none`, `plan.suspended` and `plan.member-removed`: a stop of that kind.

Any other cause, or a detail missing a figure its code needs, shall give no facts, so a client shows the engine's own sentence.

From a run's summary, the app shall say where the run stands at a plan stop: `waiting` at a unit's stop, with when the wait ends; `stopped-for-good` when it failed `budget` at a unit's stop at or after the end of its wait, because nobody continued it; or `stopped` when it failed `budget` at a plan stop without waiting. Any other run shall give none.

## Examples

- Given the cause `plan.harnessMinutes` with `used: "130"`, `limit: "120"`, `resetsAt: "2026-12-01T00:00:00.000Z"`, `planName: "Pro"` and `canUpgrade: "false"`,
  when its facts are read,
  then they are a `unit` stop of `harnessMinutes`, not a member's, 100% used, 130 of 120, resetting at that time, on `Pro`, and no bigger plan helps.
- Given the cause `plan.cost` with `used: "6.2"`, `limit: "10"`, `currency: "EUR"` and `canUpgrade: "true"`,
  when its facts are read,
  then they are 62% used, a bigger plan helps, and they hold no amount and no currency.
- Given the cause `plan.cost` with `phase: "reserve"`, `used: "9.7"`, `limit: "10"`, `needed: "0.75"` and `left: "0.3"`,
  when its facts are read,
  then the step needs up to 8% and 3% is left.
- Given the cause `plan.member.cost` with `canUpgrade: "true"`,
  when its facts are read,
  then it is a member's share, and no bigger plan helps.
- Given the cause `plan.concurrency` with `running: "2"`, `limit: "2"` and `cap: "scope"`,
  when its facts are read,
  then they are a `concurrency` stop of 2 running, at most 2, on the customer's cap.
- Given the cause `plan.cost` with no detail, `plan.inactive`, or `budget.month`,
  when its facts are read,
  then there are none.
- Given a run waiting at `plan.cost` until 3 December,
  when where it stands is read,
  then it is `waiting` until 3 December.
- Given a run that failed `budget` at `plan.cost` on 3 December, the end of its wait,
  when where it stands is read,
  then it is `stopped-for-good`.
- Given a run that failed `budget` at `plan.none`, or at `plan.cost` without waiting,
  when where it stands is read,
  then it is `stopped`.
