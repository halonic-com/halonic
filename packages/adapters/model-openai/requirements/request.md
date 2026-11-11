# model-openai.request

- Status: active
- Since: 0.1.0
- Source: HAL-2284; HAL-230 (one OpenAI-compatible adapter, decided in HAL-1448); HAL-6184 (Gemini's thought signatures)

The OpenAI-compatible provider shall write each call's messages, tools and sampling settings in the chat completions format, with `response_format` `json_object` when the request asks for JSON, and shall leave the request as it was. Settings in `params.extra` shall be added but shall never replace a field the provider writes, and its `max_tokens` and `max_completion_tokens` shall never be sent, so at most one length field goes out. An empty `stop` list shall be left out. It shall never send `meta`. A tool call with a `signature` shall be sent with it in `extra_content.google.thought_signature`, because Gemini 3 refuses a call whose tool calls lost it; a call without one shall have no `extra_content`.

## Examples

- Given an assistant turn that only calls `search`,
  when it is written,
  then its `content` is null and the call's arguments are JSON text.
- Given `params.extra` with `model: "other"`,
  when the call is written,
  then the body still names the requested model.
