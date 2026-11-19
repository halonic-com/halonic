# harness-host.bridge-failures

- Status: active
- Since: unreleased
- Source: HAL-11272, finding F2.6 of HAL-11247; plan approved by the CTO on HAL-11313

When the bridge host opens a bridge, it shall give the bridge a `reportError` that writes each failure it hears to the engine's recorder as a `bridge.failed` with the agent's id, the failure's `kind` and its `message`, so the bridge's "The run log has the details." is true. When the recorder fails, the host shall give the host's `reportError` an error that names the failure, with the recorder's error as its cause. It shall never throw into the bridge.

## Examples

- Given a bridge the host opened for the agent `writer`,
  when the bridge reports an `internal` failure,
  then the engine's recorder gets a `bridge.failed` for `writer` with that kind and message.
- Given a recorder that rejects, or one that throws before it returns,
  when the bridge reports a failure,
  then the bridge's `reportError` returns without throwing, and the host's `reportError` gets an error that names the failure, caused by the recorder's error.
