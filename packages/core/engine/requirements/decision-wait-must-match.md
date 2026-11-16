# engine.decision-wait-must-match

- Status: active
- Since: 0.1.2
- Source: HAL-11240

When an event sent to a run names a wait step, by its state and the time it started waiting, and the run doesn't wait at that step now, the engine shall refuse the event with `engine.decision-wait-must-match` before anything is recorded, so that a person who answered a wait card that has since moved on can't answer the next wait step by accident. An event without a wait step shall not be checked this way.

## Examples

- Given a run that waited at `review` and has moved on to a second wait step `publish`, which takes `approve` too,
  when `approve` is sent for the wait at `review`,
  then the engine refuses it with `engine.decision-wait-must-match` and the run log doesn't change.
- Given the same run waiting at `publish`,
  when `approve` is sent for the wait at `publish` from the time it started waiting,
  then the wait check lets it through.
