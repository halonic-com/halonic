# model-openai.stream

- Status: active
- Since: 0.1.0
- Source: HAL-2284; `contracts.llm-stream`

The OpenAI-compatible provider shall stream by asking for server-sent events with the usage in the last one, and shall read each event's `data` in order, however the bytes are split across reads, until the body ends or the server sends `[DONE]`. When the caller stops reading, it shall cancel the body.

## Examples

- Given the bytes of `data: 東京` arrive split inside a character,
  when the stream is read,
  then the event's data is `東京`.
- Given a stream whose reader stops after the first event,
  when it stops,
  then the body is cancelled.
