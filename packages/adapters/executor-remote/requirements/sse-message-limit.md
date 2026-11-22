# executor-remote.sse-message-limit

- Status: active
- Since: unreleased
- Source: HAL-16341 (agent host and remote executor checks); `executor-remote.sse`

While the client waits for the end of a server-sent event message, it shall hold at most 16 MiB of it, counted in characters, and when a message grows past that before its blank line, the client shall end the stream with a protocol error, which it does not retry, instead of holding more.

Rationale: a run's events are far smaller than the bound, and a stream whose message never ends must not fill the client's memory.

## Examples

- Given a bound of 16 characters and a message whose data runs past it with no blank line,
  then reading the stream fails with a protocol error.
- Given a bound of 16 characters and messages of up to 16 characters each,
  then every message comes back.
