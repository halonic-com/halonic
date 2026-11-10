# harness-codex.run-events

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan D3; HAL-3998

The Codex harness shall keep a run's events between Codex, whose messages come when Codex sends them, and the reader of the run's stream, which asks for one event at a time. Events shall be read in the order they came, the ones that came before the stream ended included, and then the stream shall end the way it ended: by itself or with its error. Only the first ending shall count; events and endings that come after it shall be dropped. A reader that waits for the next event shall be woken when one comes or the stream ends.

## Examples

- Given a `tool.called` and then an `agent.finished`, the second pushed while the reader waits,
  when the stream ends,
  then the reader gets both, in order, and the stream ends without an error.
- Given a `tool.called` and then the error "Codex stopped",
  when the stream is read,
  then the reader gets the `tool.called`, then the error.
- Given a stream that has ended,
  when an error or an event comes,
  then the reader gets neither.
