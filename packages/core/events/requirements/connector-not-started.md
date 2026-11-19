# events.connector-not-started

- Status: active
- Since: unreleased
- Source: HAL-13829 (CN2 of the C248 check on HAL-13818): a connector that can't start when a step begins left no trace in the run log

The run log shall have a `connector.not-started` event for a connector of an agent's file that didn't start when a model turn listed its tools, with the `agent` whose turn it was, the connector's id in `connector`, and why in `cause`, in the shape of a `tool.result`'s `connector-not-started` cause (`events.tool-result-cause`): `why` is `program-missing`, `secret-not-set` or `other`, with the program's or the secret's `name` when the engine knows it, never a secret's value or the error's text.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `connector.not-started` is among them, with `agent`, `connector` and `cause`.
- Given a `connector.not-started` event whose cause has the code `time-limit`,
  when its type is checked,
  then it is not a valid run event.
