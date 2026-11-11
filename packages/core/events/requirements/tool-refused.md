# events.tool-refused

- Status: active
- Since: 0.1.0
- Source: HAL-4658, decided by the CTO on HAL-4657 after the connector allow-list attack tests of HAL-4629

The run log shall have a `tool.refused` event for a model's tool call that was refused before it ran, with the `agent` that made it, the tool's name in `tool` exactly as the model wrote it, the model's id for the call in `toolCallId`, and why it was refused in `reason`: `not-offered` when the step offered no tool of that name.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `tool.refused` is among them, with `agent`, `tool`, `toolCallId` and `reason`.
- Given a `tool.refused` event whose `reason` is any text other than `not-offered`,
  when its type is checked,
  then it is not a valid run event.
