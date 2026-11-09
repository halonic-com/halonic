# events.connector-started

- Status: active
- Since: 0.1.0
- Source: [HAL-1668 failure-path decisions](/HAL/issues/HAL-1668#document-decisions); task HAL-1728

The run log shall have a `connector.started` event, written before a step calls a connector's program, with the step's `state`, its `agent`, the connector's id in the workspace in `connector`, and the time limit for the call in milliseconds in `timeoutMs`. Every wait ends, so every call has a limit. It has the shape of `harness.started` and `sandbox.started` (HAL-189), so a screen can say what a step has been waiting for, since when and for how long at most.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `connector.started` is among them, with `state`, `agent`, `connector` and `timeoutMs`.
- Given a `connector.started` event without `timeoutMs`,
  when its type is checked,
  then it is not a valid run event.
