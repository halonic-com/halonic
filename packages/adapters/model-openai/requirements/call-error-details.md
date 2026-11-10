# model-openai.call-error-details

- Status: active
- Since: 0.1.0
- Source: HAL-2972, from the review of #839, which shares these gaps with #693; `ModelCallError` in the `LlmProvider` port v1

When the caller's signal aborts while the provider reads an error reply, the OpenAI-compatible provider shall fail with the abort's reason, not with what the status means. The error shall keep none of the server's own text whenever that text holds the key the call was sent with, whatever the key looks like. An `offline` error shall name the host, and its port when the address gives one, that couldn't be reached, and its message shall say "Halonic couldn't reach _id_ at _host_", or "Halonic couldn't reach _id_" when the address gives no host.

## Examples

- Given a proxy whose key is "proxy-0123" answers 500 with "bad key proxy-0123",
  when `chat` fails,
  then its message ends in "(HTTP 500)" and its cause holds none of the proxy's text.
- Given the base URL "http://localhost:11434/v1" can't be reached,
  when `chat` fails,
  then the error says `offline` and names the host "localhost:11434".
