# events.connector-listing-failed

- Status: active
- Since: unreleased
- Source: HAL-13670 (from Nina's C207 note on HAL-13667: a run whose connector's program was missing ended "✓" and its log never said why the tools were missing)

The run log shall have a `connector.listing-failed` event for a connector an agent's file lists that couldn't list its tools when a model turn started, with the `agent` whose turn it was, the connector's id in `connector`, and why in `cause`: the `connector-not-started` cause of `tool.result` (`events.tool-result-cause`), whose `why` is `program-missing` or `secret-not-set` with the program or the secret's `name` when the engine knows, and `other` with no name otherwise. It shall never hold the error's own text, a secret's value or the program's output.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `connector.listing-failed` is among them, with `agent`, `connector` and `cause`.
- Given a `connector.listing-failed` event whose `cause` has a `code` other than `connector-not-started`,
  when its type is checked,
  then it is not a valid run event.
