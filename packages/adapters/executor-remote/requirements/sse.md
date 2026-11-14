# executor-remote.sse

- Status: active
- Since: 0.1.0
- Source: HAL-195 (build plan PR 10d, remote run executor); PR 10 plan approved on HAL-9093

The client shall read a run's events from a server-sent event stream parsed from the `fetch` response body, not through `EventSource`, which can't carry the session cookie of a native client or take a signal. It shall split messages on a blank line whatever the chunks are (a chunk may end in the middle of a line, a message or a multi-byte character) and accept `\n`, `\r\n` and `\r` line ends. It shall skip comment lines and messages without data, join several `data:` lines with a newline, and give a message without an `event:` the name `message`. A message counts only when its blank line arrived: a body that ends inside a message drops the half message, so a broken connection never delivers part of an event.

Rationale: the host sends one `run` message per event and an `end` message at the end, over a body that arrives in arbitrary pieces; a half event must never reach a run view.

## Examples

- Given the body `id: 1\nevent: run\ndata: {"seq":1}\n\n` cut after `ev`, `ent: ru` and the rest, then one `run` message with id `1` comes back.
- Given `data: a\ndata: b\n\n`, then one message with data `a\nb`.
- Given `: keep-alive\n\n` or `event: run\n\n`, then no message comes back.
- Given a body that ends after `event: run\ndata: {"se`, then no message comes back for it.
- Given CRLF line ends, then the messages are the same as with LF.
