# model-openai.call-errors

- Status: active
- Since: 0.1.0
- Source: HAL-2284; `ModelCallError` reasons in the `LlmProvider` port v1

The OpenAI-compatible provider shall fail with `refused` on HTTP 401 or 403, `model-missing` on 404, `model-no-tools` when the request offered tools and the server says the model doesn't support them, `offline` when the server can't be reached, and `refused` on any other error or a reply it can't read. The message shall keep the server's own error text, shortened, except after 401 or 403 and whenever that text holds something shaped like a key. Every failed call shall be closed. A call stopped while the error text is read shall fail with the abort's reason.

## Examples

- Given OpenAI answers 401 with "Incorrect API key provided: sk-…",
  when `chat` fails,
  then the error says `refused` and its message holds none of the vendor's text.
- Given Ollama answers 400 with "does not support tools" to a request without tools,
  when `chat` fails,
  then the error says `refused`.
