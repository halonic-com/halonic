# contracts.llm-stream

- Status: active
- Since: 0.1.0
- Source: HAL-181 (decided there with Liam: run only where the provider streams); `LlmProvider` port v1

Where an adapter's `capabilities.streaming` is true, its `stream` shall yield deltas in order and end with exactly one `done` event, last, whose response is what `chat` gives for the same model answer. The `text` deltas joined shall equal the response's content, the `reasoning` deltas joined its reasoning summary where the vendor gives one, and for each tool call the first piece shall carry its id and name and the `arguments` pieces joined shall parse to its arguments. When the vendor refuses the call or the signal aborts, the stream shall end with an error and no `done`; an already aborted stream shall not reach the vendor. When the caller stops reading, the call shall be closed.

## Examples

- Given the model answers with text,
  when the stream is read to the end,
  then the text deltas join to the `done` content, and `done` equals what `chat` gives.
- Given the model has streamed `Hel`,
  when the signal aborts,
  then the stream ends with an error and no `done`, and no call is left open.
- Given the model has streamed `Hel` and is still answering,
  when the caller aborts the signal while handling that delta,
  then the stream ends with an error and no `done`, and no call is left open.
- Given the model has streamed the first piece of a text answer,
  when the signal aborts,
  then the stream ends with an error and no `done`, and no call is left open.
- Given a stream,
  when the caller stops after the first event,
  then no call is left open.
