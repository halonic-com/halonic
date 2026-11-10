# engine.wait-state

- Status: active
- Since: 0.1.0
- Source: HAL-1528, step 3(c) of the HAL-186 plan; the description from Liam's architecture decision on HAL-1218 (HAL-2560)

When a run enters a `wait` state, the engine shall record `run.waiting` with the events the state takes, the due time of each of its timers and the state's description filled in against the run as in `workflow.render-description`, with an empty title or body left out, and shall set one timer for each. When an event the state takes is sent, the engine shall record `event.received`, write the event's payload, if it has one, to `lastEvent` in the context, and take the first transition for the event whose guard passes. When no guard passes, the engine shall refuse the event with `engine.input-not-accepted` and record nothing.

## Examples

- Given a `decide` wait state with `approve`, `reject` and an `after: 2d` timer,
  when the run enters it at 09:00 on 9 November,
  then the engine records `run.waiting` with `approve, reject` and a timer due at 09:00 on 11 November, and sets that timer.
- Given a wait state described as `Approve?`, `Outcome: {{context.outcome}}` and `{{context.note}}`, and a context with the outcome "pending" and no note,
  when the run enters it,
  then `run.waiting` has the title "Approve?" and the body "Outcome: pending".
- Given a wait state without a description,
  when the run enters it,
  then `run.waiting` has no title and no body.
- Given the same run,
  when `approve` is sent with the payload `{ note: "ok" }`,
  then the engine records `event.received`, sets `lastEvent` to `{ note: "ok" }` and moves on `approve` to `approved`.
- Given an `approve` transition that needs `context.lastEvent.note`,
  when `approve` is sent without a payload,
  then the engine refuses it with `engine.input-not-accepted`.
