# engine.meter-port

- Status: active
- Since: unreleased
- Source: HAL-16241 (split from HAL-13218); the selling layer's design (HAL-12483), sections 4.1, 4.2 and 13.6; the counting rule of `events.summary-cost`

The engine shall offer a `Meter` port with `check(principal, { kind })`, `reserve(principal, maximum)`, `settle(reservation, times)` and `record(principal, usage)`, where the principal is `{ actor, scope, role }`. The usage the meter takes shall be made only by the engine: a model call's from its `llm.response` in the run log, counted by the rule a run's summary adds calls up with (`events.summary-cost`), a run's end from the ended run's state, and a harness step's wall and harness time from the engine's `Clock`. `record` and `settle` shall take no cost, token count, time or payer as a plain value, so nothing a step or a container says about its own use is counted. The `maximum` a step reserves is its agent's `harnessLimits`, which the workflow's author sets. `NoMeter` shall allow every check and reservation and record nothing, so a workspace that sets no meter runs as it does without one.

## Examples

- Given an `llm.response` with 1,000 input and 200 output tokens and cost 0.006,
  when the meter's usage of it is made,
  then it is a `model_call` with those tokens and cost 0.006, counted `priced`.
- Given an `llm.response` marked `paidBy: "subscription"` with cost 0.5,
  when the meter's usage of it is made,
  then its cost is 0 and it is counted `subscription`, as the run's summary counts it.
- Given an `llm.response` marked `cached: true`,
  when the meter's usage of it is made,
  then it has no tokens and costs 0.
- Given a step that started 90 seconds ago by the engine's clock and whose program started 60 seconds ago,
  when its times are made,
  then they are 90,000 ms of wall time and 60,000 ms of harness time.
- Given a running run,
  when the meter's usage of its end is made,
  then it is refused, since the run hasn't ended.
- Given a plain object `{ kind: "model_call", cost: 0 }` that a step wrote,
  when it is passed to `record`,
  then it doesn't typecheck.
- Given `NoMeter`,
  when a run start, a model call and a harness run are checked and a step reserves,
  then each is allowed.
