# model-anthropic.stream

- Status: active
- Since: 0.1.0
- Source: HAL-2921; `ChatStreamEvent` in the `LlmProvider` port v1

When the Messages API streams an answer, the Anthropic provider shall pass on each text and thinking delta as a `text` or `reasoning` piece, thinking blocks after the first starting with a blank line, and each `tool_use` block as `tool-call` pieces: the first names the call, and the rest carry its input JSON. A call's `index` shall count only the `tool_use` blocks. It shall rebuild the message from the events, so the final answer equals what `chat` would read from the same message sent without streaming, signatures included.

## Examples

- Given a thinking block, a text block and two `tool_use` blocks, streamed,
  when the stream ends,
  then the pieces add up to the final answer's reasoning, text and tool calls, at indexes 0 and 1.
