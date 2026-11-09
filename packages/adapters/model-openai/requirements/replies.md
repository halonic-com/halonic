# model-openai.replies

- Status: active
- Since: 0.1.0
- Source: HAL-2284; the plan's decision to show the reasoning of local thinking models

The OpenAI-compatible provider shall answer with the first choice's text, tool calls and usage, and shall give the reasoning a server sends as `reasoning_content` or `reasoning`. An answer with tool calls shall finish with `tool_calls` when the server says `stop` or `tool_calls`, and with `length` when the server says `length`. Tool call arguments sent as an object shall be taken as they are; arguments that aren't a JSON object shall be passed on as `{ input: <the text> }`. A tool call without an id shall get `call_<its index>`.

## Examples

- Given Ollama answers with tool calls and finish reason `stop`,
  when `chat` returns,
  then its finish reason is `tool_calls`.
- Given the model writes the arguments `{"q": "acme"`,
  when `chat` returns,
  then the call's arguments are `{ input: '{"q": "acme"' }`.
