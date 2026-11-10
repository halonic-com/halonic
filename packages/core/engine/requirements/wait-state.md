# engine.wait-state

- Status: active
- Since: 0.1.0
- Source: HAL-1528, step 3(c) of the HAL-186 plan

When a run enters a `wait` state, the engine shall record `run.waiting` with the events the state takes and the due time of each of its timers, and shall set one timer for each. When an event the state takes is sent, the engine shall record `event.received`, write the event's payload, if it has one, to `lastEvent` in the context, and take the first transition for the event whose guard passes. When no guard passes, the engine shall refuse the event with `engine.input-not-accepted` and record nothing.

## Examples

- Given a `decide` wait state with `approve`, `reject` and an `after: 2d` timer,
  when the run enters it at 09:00 on 9 November,
  then the engine records `run.waiting` with `approve, reject` and a timer due at 09:00 on 11 November, and sets that timer.
- Given the same run,
  when `approve` is sent with the payload `{ note: "ok" }`,
  then the engine records `event.received`, sets `lastEvent` to `{ note: "ok" }` and moves on `approve` to `approved`.
- Given an `approve` transition that needs `context.lastEvent.note`,
  when `approve` is sent without a payload,
  then the engine refuses it with `engine.input-not-accepted`.
