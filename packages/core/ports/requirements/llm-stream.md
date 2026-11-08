# ports.llm-stream

- Status: active
- Since: 0.1.0
- Source: decided on HAL-181 for the streaming model adapters of phase 3; an optional method keeps version 1

Where a model provider sets `capabilities.streaming`, the `LlmProvider` port shall let it offer an optional `stream(request)` that yields text, reasoning and tool-call deltas in order and ends with exactly one `done` event holding the full `ChatResponse`. A provider without it shall still satisfy the port.

The port's documentation shall state that the text deltas joined equal the `done` response's content, that the `arguments` pieces for each tool call joined parse to that call's arguments, that a stream ending without `done` or yielding after it is an error for the caller, and that the engine runs tool calls only from `done`.

## Examples

- Given an `LlmProvider` with only `chat`,
  when it is compiled,
  then it compiles.
- Given an `LlmProvider` whose `stream` yields a text delta, a tool-call delta and `done`,
  when a caller reads the stream,
  then it gets the deltas in order and the `done` event last, with the full response.
- Given a `ChatStreamEvent` of type `done` without a `response`,
  when it is compiled,
  then it doesn't compile.
