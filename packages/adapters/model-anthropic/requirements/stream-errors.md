# model-anthropic.stream-errors

- Status: active
- Since: 0.1.0
- Source: HAL-2921; `stream()` in the `LlmProvider` port v1

When a streamed answer fails after it has started, the Anthropic provider shall end the stream with an error and no `done`: `refused` on an `error` event (with its text, under the same rules as call errors), on a stream that ends before `message_stop`, on event data it can't read, or on a tool input that isn't a JSON object, and `offline` when the connection drops.

## Examples

- Given the API sends some text and then an `overloaded_error` event,
  when the stream is read,
  then the text pieces arrive, and the stream ends with `refused` and no `done`.
