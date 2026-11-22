# engine.meter-checks

- Status: active
- Since: unreleased
- Source: HAL-16241 (split from HAL-13218); the selling layer's design (HAL-12483), sections 4.1, 4.2, 11 (G7) and 13.2; builds on `engine.meter-port`, `engine.plan-stops` and `engine.budget-stops`

The local executor shall meter its runs through the host's meter, or through `NoMeter` for the workspace's owner when the host gives none, so a workspace without a meter runs as before. The principal a run counts against shall come only from the host, asked by the id of the run's top-level run, never from the run's input, its workflow or a step; a child run counts against its top-level run's principal.

- Before a top-level run's start is recorded, the engine shall ask `check(principal, { kind: "run-start" })`. When the meter refuses, the start shall throw a `limit_reached` error with the meter's cause, such as `plan.concurrency`, and nothing shall be recorded.
- When a step decides on a model call or a harness run, the engine shall check the limits from inner to outer: the run budget, then `check(principal, { kind })` with `model-call`, or `harness-run` when the decision starts one, then the monthly budget. The first limit reached shall stop the run as `engine.budget-stops` says: its decided events, then `run.failed` with the reason `budget` and the limit's cause, and no call.
- When a step has just ended a top-level run, the engine shall `record` the run's end.

Only an answer of `allowed: true` shall allow. An answer without a `plan.` stop, or that isn't an answer at all, shall refuse with `plan.none`. When the meter can't be asked, the step shall throw, storing nothing and making no call.

## Examples

- Given no meter, `NoMeter`, or a meter that allows everything,
  when a `reply` run starts and completes,
  then its log is the same each time, and the meter was asked `run-start`, then `model-call`, and told of the run's end once.
- Given a meter that refuses model calls with `plan.cost`, `plan.suspended` or `plan.member-removed`,
  when a `reply` run starts,
  then it fails in `draft` with the reason `budget` and that cause, and no model is called.
- Given a run budget of 0 and a meter that refuses model calls,
  when a `reply` run starts,
  then it fails with `budget.run`, and the meter isn't asked about the model call.
- Given a monthly budget that is reached and a meter that refuses model calls with `plan.cost`,
  when a `reply` run starts,
  then it fails with `plan.cost`.
- Given a meter that refuses starts with `plan.concurrency`,
  when a run is started,
  then the start throws a `limit_reached` error with that cause, and no run exists.
- Given a meter that answers `{ allowed: false }` with no stop,
  when a `reply` run starts,
  then it fails with `plan.none`.
- Given a meter that throws when asked about a model call,
  when a `reply` run starts,
  then the start throws, no run exists and no model is called.
- Given an `onboard` run whose state runs a `reply` child run,
  when it completes,
  then the host was asked only for the principal of the top-level run, and only its end was recorded.
