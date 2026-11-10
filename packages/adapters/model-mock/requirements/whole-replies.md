# model-mock.whole-replies

- Status: active
- Since: 0.1.0
- Source: HAL-3418

When a scripted reply is a whole answer, the mock model shall give it back exactly, with its own usage, finish reason, tool call ids and reasoning. When it is `{ refuse }`, the mock model shall fail the call with a `refused` model call error. When it is `{ hang: true }`, the mock model shall keep the call open until the request's signal aborts, and shall refuse a hang that has no signal.

## Examples

- Given the script `{ writer: [{ content: "The list goes on and", toolCalls: [], usage: { inputTokens: 12, outputTokens: 5 }, finishReason: "length" }] }`,
  when the writer is answered,
  then it gets that answer as it is.
- Given the script `{ writer: [{ refuse: "Key expired." }] }`,
  when the writer is answered,
  then the call fails as refused with "Key expired.".
