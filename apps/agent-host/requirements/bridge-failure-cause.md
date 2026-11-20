# agent-host.bridge-failure-cause

- Status: active
- Since: unreleased
- Source: HAL-13891, follow-up to HAL-13862 and HAL-13882: a run whose bridge fails to open in the agent host keeps the cause it would keep in Studio's own process

When a bridge fails to open, the agent host shall send, on the `failed` line next to the message, the error's kind unless it is `internal`, and the error's `failureCause` with only the parts that fit: a `code` of at most 64 characters, and at most 8 `detail` entries whose key has at most 40 characters and whose value is a string of at most 300. It shall read nothing else from the error. An error without a kind and without a cause shall send the message alone, as before.

## Examples

- Given a bridge server whose `open` throws `invalid_input` with the cause `harness-bridge.socket-path-too-long` and the detail `{ bytes, limit, system }`,
  when Studio opens a bridge,
  then the `failed` line has that message, `kind: "invalid_input"` and that cause.
- Given a bridge server whose `open` throws a plain `Error("no free port")`,
  when Studio opens a bridge,
  then the `failed` line is `{ type: "failed", message: "no free port" }`.
- Given a cause whose `detail` has a value of 301 characters, a key of 41 characters, a number and 10 more entries,
  when the bridge fails to open,
  then the line keeps the first 8 of those 10 entries.
