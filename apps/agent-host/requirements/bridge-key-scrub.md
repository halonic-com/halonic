# agent-host.bridge-key-scrub

- Status: active
- Since: unreleased
- Source: HAL-13795 (plan and Liam's changes approved on HAL-13795; the CLI's scrub from HAL-12784)

When Studio gives a bridge in the agent host the value of a provider key, the agent host shall remember it for that bridge, and shall remove every remembered value from the message of each failure the bridge reports before it sends the failure to Studio's recorder as a `bridge.failed`, or writes it to its own log when Studio doesn't take it. It shall remember no value for a secret the bridge's providers don't name, as it asks Studio for none.

## Examples

- Given a bridge Studio gave the key in `anthropic-key`,
  when the bridge reports a failure whose message quotes that key,
  then the `bridge.failed` Studio gets, and the agent host's log, hold the message with the key removed.
- Given a bridge whose providers name no key,
  when it asks for `anthropic-key`,
  then it gets nothing, and nothing is remembered.
