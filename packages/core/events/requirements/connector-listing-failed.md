# events.connector-listing-failed

- Status: active
- Since: unreleased
- Source: HAL-13670 (from Nina's C207 note on HAL-13667: a run whose connector's program was missing ended "✓" and its log never said why the tools were missing); the plugin reasons from HAL-14974 (Kim's C522 finding on HAL-14972: a run with a plugin added but not trusted warned only "couldn't list its tools"); `plugin-stopped` from flow check C600 #4 (HAL-15608); `sandbox-not-ready`: HAL-14296; `program-stopped` from HAL-15606 (C600 #1)

The run log shall have a `connector.listing-failed` event for a connector an agent's file lists that couldn't list its tools when a model turn started, with the `agent` whose turn it was, the connector's id in `connector`, and why in `cause`: the `connector-not-started` cause of `tool.result` (`events.tool-result-cause`), whose `why` is `program-missing`, `program-stopped` or `secret-not-set` with the program or the secret's `name`, `plugin-not-trusted` or `plugin-changed` with the plugin's id in `name`, or `plugin-stopped` with the plugin's name in `name`, when the engine knows, `sandbox-not-ready` with no name when the sandbox a plugin's backend runs in isn't ready, and `other` with no name otherwise. It shall never hold the error's own text, a secret's value or the program's output.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `connector.listing-failed` is among them, with `agent`, `connector` and `cause`.
- Given a `connector.listing-failed` event whose `cause` has a `code` other than `connector-not-started`,
  when its type is checked,
  then it is not a valid run event.
