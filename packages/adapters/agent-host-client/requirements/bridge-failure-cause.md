# agent-host-client.bridge-failure-cause

- Status: active
- Since: unreleased
- Source: HAL-13891, follow-up to HAL-13862 and HAL-13882: a run whose bridge fails to open in the agent host keeps the cause it would keep in Studio's own process

When the host's first line for a bridge is `failed`, the stand-in bridge host shall take an optional `kind` (1 to 32 characters) and an optional `failureCause` next to the message: a `code` of 1 to 64 characters and a `detail` of at most 8 entries, each a key of 1 to 40 characters and a string value of at most 300, and nothing more. It shall hang up and throw an error whose message is the line's message, whose kind is the line's `kind` when that is one of the error kinds and `bridge_failed` otherwise, and which carries the line's `failureCause` as its own `failureCause` when the line has one, so the engine records the run's typed cause. A `failed` line with a cause of another shape shall be a line of the wrong shape.

## Examples

- Given a host whose first line is `failed` with `kind: "invalid_input"` and the cause `harness-bridge.socket-path-too-long`,
  when Studio opens a bridge,
  then `open` throws an `invalid_input` error with that cause and hangs up the stream.
- Given a host whose first line is `{ type: "failed", message: "No port free." }`,
  when Studio opens a bridge,
  then `open` throws `bridge_failed` with no `failureCause`.
- Given a host whose `failed` line has a cause with 9 `detail` entries,
  when Studio opens a bridge,
  then `open` throws `answer_invalid` and hangs up the stream.
