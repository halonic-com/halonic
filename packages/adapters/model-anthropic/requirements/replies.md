# model-anthropic.replies

- Status: active
- Since: 0.1.0
- Source: HAL-2921; `ProviderReplay` in the `LlmProvider` port v1

The Anthropic provider shall answer with the reply's text blocks joined, its thinking blocks as the reasoning, its `tool_use` blocks as tool calls in order, and `input_tokens` and `output_tokens` as the usage. It shall map `end_turn` and `stop_sequence` to `stop`, `max_tokens` to `length`, and an answer with tool calls to `tool_calls`. When the reply holds thinking, its content blocks shall go into the replay, so the next turn can send them back.

## Examples

- Given a reply with a thinking block, a text block and a `tool_use` block,
  when `chat` returns,
  then it gives the reasoning, the text and the call, finishes with `tool_calls`, and its replay holds all three blocks.
- Given a reply that stopped at `max_tokens`,
  when `chat` returns,
  then its finish reason is `length`.
