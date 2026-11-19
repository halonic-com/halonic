# agent-host-client.bridge-failures

- Status: active
- Since: unreleased
- Source: HAL-11272, finding F2.6 of HAL-11247; plan approved by the CTO on HAL-11313

The agent host shall send each failure its bridge reports through `reportError` to Studio as a `recorder.record` call with a `bridge.failed` (`agent`, `kind`, `message`), so no new line type is needed. The host shall write a failure Studio doesn't take to its standard error, and never throw into the bridge. The stand-in bridge host shall record a `bridge.failed` only with exactly those fields, answering an error for any other shape, and shall write the bridge's token in its message as `[run token]`. A host that never sends one shall work as before.

## Examples

- Given an open bridge `b1`,
  when the host calls `recorder.record` with a `bridge.failed` for `writer`,
  then the engine's recorder gets it and the host gets `null`.
- Given an open bridge whose token is `run-token`,
  when the host calls `recorder.record` with a `bridge.failed` whose message holds `run-token` twice,
  then the engine's recorder gets the message with `[run token]` in both places.
- Given a `bridge.failed` with a `cost`, or without a `message`,
  when the host calls `recorder.record` with it,
  then the host gets an error answer and nothing is recorded.
- Given a bridge in the agent host whose request failed for a reason it didn't name,
  when the bridge reports it,
  then Studio gets a `recorder.record` call with the `bridge.failed`, and when Studio fails that call, the host writes the failure to its standard error.
