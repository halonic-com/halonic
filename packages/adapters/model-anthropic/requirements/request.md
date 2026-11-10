# model-anthropic.request

- Status: active
- Since: 0.1.0
- Source: HAL-2921; HAL-2284 (model adapters); plan section 7 (no SDK, the built-in `fetch`)

The Anthropic provider shall write each call in the Messages API format: the system messages joined into `system`, tool results as `tool_result` blocks in a user message, turns of the same role in a row merged into one message with its tool results first, tools with an `input_schema`, and `max_tokens` on every call, 4096 when the request sets none. An assistant turn whose replay is Anthropic's shall be sent as the replay's content blocks, unchanged. It shall leave the request as it was. Settings in `params.extra` shall be added but shall never replace a field the provider writes. It shall never send `meta`.

## Examples

- Given two tool results in a row and then a user message,
  when they are written,
  then they form one user message with both `tool_result` blocks first.
- Given an assistant turn with an Anthropic replay that holds a thinking block,
  when it is written,
  then the message's content is that replay's blocks, signature included.
- Given `params.extra` with `model: "other"`,
  when the call is written,
  then the body still names the requested model.
