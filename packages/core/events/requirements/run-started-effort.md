# events.run-started-effort

- Status: active
- Since: unreleased
- Source: HAL-17252 (token phase 1c, plan approved by Liam on the task)

The events package shall let a `run.started` event name, in an optional `effort`, the value `low`: every harness agent of the run then gets the low effort on its model calls, in place of the one its file or its alias sets, so a run started with less thinking decides the same way when its log is read again. The override is a field of its own, not a key in the run's `input`, because the input reaches the agents' prompts. A `run.started` without `effort`, as a run that keeps the default and older logs have it, shall read as before.

## Examples

- Given a `run.started` event with `effort: "low"`,
  when its type is checked,
  then it is a valid run event.
- Given a `run.started` event without `effort`,
  when its type is checked,
  then it is a valid run event.
- Given a `run.started` event with `effort: "high"`,
  when its type is checked,
  then it is refused, since the run's effort has only the low level and the default.
