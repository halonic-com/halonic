# model-openai.call-errors

- Status: active
- Since: 0.1.0
- Source: HAL-2284; `ModelCallError` reasons in the `LlmProvider` port v1; `key-refused`, `out-of-credit` and `provider-busy` added on HAL-3008, from the provider fact sheet on HAL-3058

The OpenAI-compatible provider shall fail with `out-of-credit` on HTTP 402 and on any error whose type or code says the credit or a spend limit is used up (`insufficient_quota`, `credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded`, `organization_usage_limit_exceeded`), `key-refused` on 401 and on a 403 whose text doesn't name a country, region, moderation or the model, `model-missing` on 404, `model-no-tools` when the request offered tools and the server says the model doesn't support them, `provider-busy` on any other 429, Groq's 498 and any 5xx, `offline` when the server can't be reached, and `refused` on any other error or a reply it can't read. The message shall end in the HTTP status and hold none of the server's own error text, which Studio and the command line don't show (microcopy 1.4). The error's `cause` shall keep that text, shortened, except when the key is refused and whenever it holds something shaped like a key. Every failed call shall be closed. A call stopped while the error text is read shall fail with the abort's reason.

## Examples

- Given OpenAI answers 401 with "Incorrect API key provided: sk-…",
  when `chat` fails,
  then the error says `key-refused`, and neither its message nor its cause holds any of the vendor's text.
- Given Ollama answers 400 with "does not support tools" to a request without tools,
  when `chat` fails,
  then the error says `refused`.
- Given OpenAI answers 403 that its country or region isn't supported,
  when `chat` fails,
  then the error says `refused`, not `key-refused`.
