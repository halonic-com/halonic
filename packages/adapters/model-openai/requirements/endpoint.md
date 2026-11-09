# model-openai.endpoint

- Status: active
- Since: 0.1.0
- Source: HAL-2284; the `HttpClient` port v1 (`redirect: "error"` keeps a bearer token at its address)

The OpenAI-compatible provider shall send each call as `POST {baseUrl}/chat/completions`, with or without a trailing `/` on the base URL, and shall not follow redirects. It shall send the key only in the `Authorization` header, never in the body, and no such header when it has no key.

## Examples

- Given the base URL `http://localhost:11434/v1/`,
  when a call is sent,
  then it goes to `http://localhost:11434/v1/chat/completions`.
