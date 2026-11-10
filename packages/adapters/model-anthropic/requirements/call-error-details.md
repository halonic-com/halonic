# model-anthropic.call-error-details

- Status: active
- Since: 0.1.0
- Source: HAL-2972, from the review of #839; `ModelCallError` in the `LlmProvider` port v1

When the caller's signal aborts while the provider reads an error reply, the Anthropic provider shall fail with the abort's reason, not with what the status means. The message shall leave out the API's own text whenever that text holds the key the call was sent with, whatever the key looks like. An `offline` error shall name the host, and its port when the address gives one, that couldn't be reached.

## Examples

- Given a proxy whose key is "proxy-0123" answers 500 with "bad key proxy-0123",
  when `chat` fails,
  then its message ends in "(HTTP 500)".
- Given the base URL "http://localhost:8080/anthropic" can't be reached,
  when `chat` fails,
  then the error says `offline` and names the host "localhost:8080".
