# model-anthropic.stream-errors

- Status: active
- Since: 0.1.0
- Source: HAL-2921; `stream()` in the `LlmProvider` port v1; HAL-3561, from the review of #984; HAL-5216

When a streamed answer fails after it has started, the Anthropic provider shall end the stream with an error and no `done`. On an `error` event, the reason shall be the one the status of the event's type gets as a call error (`overloaded_error` is a 529, so `provider-busy`), and `refused` for a type it doesn't know. The API's text shall stay out of the message and go on the error's `cause` under the same rules as call errors. The reason shall be `refused` on a stream that ends before `message_stop`, on event data it can't read, on a block that doesn't start next in order, or on a tool input that isn't a JSON object, and `offline` when the connection drops.

## Examples

- Given the API sends some text and then an `overloaded_error` event,
  when the stream is read,
  then the text pieces arrive, and the stream ends with `provider-busy` and no `done`, as a 529 for the same call would.
- Given a stream whose first block starts at index 4000000000,
  when the stream is read,
  then it ends with `refused` straight away.
