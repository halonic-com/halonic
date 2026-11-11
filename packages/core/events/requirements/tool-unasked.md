# events.tool-unasked

- Status: active
- Since: 0.1.0
- Source: HAL-5583 (board decision on HAL-5522, option A: the run record shows when a tool ran without asking because the workspace marked it read-only)

The run log shall have a `tool.unasked` event for a connector's tool call that runs without asking a person because the `read` list of the connector's file names the tool, with the `agent` that made it, the connector's id in `connector`, the tool's name in `tool` as the model called it, and why no one was asked in `reason`: `read-list`.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `tool.unasked` is among them, with `agent`, `connector`, `tool` and `reason`.
- Given a `tool.unasked` event whose `reason` is any text other than `read-list`,
  when its type is checked,
  then it is not a valid run event.
