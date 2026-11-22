# agent-host-client.bridge-allowed-waited

- Status: active
- Since: unreleased
- Source: HAL-16473, for the model-mix trials of HAL-16440 (Liam's task: how long each tool-permission round trip takes)

When the agent host calls `recorder.record` with a `harness.allowed`, the stand-in bridge host shall also accept, besides the fields of `agent-host-client.bridge-allowed`, an optional `waitedMs` that is a whole number of milliseconds of 0 or more, and record it as it came. It shall answer an error, and record nothing, for a `waitedMs` of any other kind.

## Examples

- Given an open bridge,
  when the host calls `recorder.record` with a `harness.allowed` with `waitedMs: 40`,
  then the engine's recorder gets it with `waitedMs: 40` and the host gets `null`.
- Given an open bridge,
  when the host calls `recorder.record` with a `harness.allowed` whose `waitedMs` is -1, 1.5 or `"40"`,
  then the host gets an error answer and nothing is recorded.
