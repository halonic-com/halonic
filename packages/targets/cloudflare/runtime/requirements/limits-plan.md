# runtime.limits-plan

- Status: active
- Since: unreleased
- Source: HAL-18212 (follow-up to HAL-18203 and HAL-18211); the limits document of `runtime.limits-push`; one plan shape with `runtime.limits-push-plan` (HAL-18243)

When the scope's usage object keeps a limits document with a plan, `{ "id", "version", "name" }` (taken from Cloud's `plan` by `runtime.limits-push-plan`), it shall keep it only if the id is a machine id, the version a whole number of 0 or more and the name 1 to 200 characters, not only blanks, with no control or format characters (`\p{Cc}`, `\p{Cf}`), and a stop for a reached limit under that document shall name it in its detail as `planId`, `planVersion` and `planName`. A stop under a document without one shall name the placeholder plan `cloud`, version 0, with an empty name. A pushed document whose plan isn't valid shall answer 400 `bad_limits`.

Rationale: a stop should name the plan the customer is on, and only Cloud knows it.

## Examples

- Given a push whose plan is `{ "state": "active", "id": "pro", "version": 3, "name": "Pro" }`, which was kept,
  when a run reaches its cost limit,
  then the stop's detail has `planId: "pro"`, `planVersion: "3"` and `planName: "Pro"`.
- Given a push whose plan, in a state other than `none`, has no name,
  when it is pushed,
  then the answer is 400 `bad_limits`.
