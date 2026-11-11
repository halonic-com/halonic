# model-openai.call-limits

- Status: active
- Since: 0.1.0
- Source: HAL-5216; `docs/guides/failure-path.md` rule 1; the harness bridge's limits

The OpenAI-compatible provider shall end every call it makes on its own time limits, whether or not the caller passed a signal: the reply must start within the response limit, 10 minutes when it is given none, and a reply that has started must send something at least once per idle limit, 2 minutes when it is given none. When a limit passes, the call shall fail with `offline`, naming the host and the limit, and the provider shall close the call. When the caller's signal aborts first, the call shall still fail with the caller's own reason.

## Examples

- Given a server that accepts the call and never answers,
  when 10 minutes pass,
  then `chat` fails with `offline` and the message says the provider didn't answer within 600 seconds.
- Given a streamed reply that has sent "Hel" and then nothing,
  when the idle limit passes,
  then the stream has given the "Hel" piece and ends with `offline`, with no `done`.
