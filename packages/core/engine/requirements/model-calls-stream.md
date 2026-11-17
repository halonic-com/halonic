# engine.model-calls-stream

- Status: active
- Since: unreleased
- Source: HAL-11057, follow-up to the review of halonic#3165 (HAL-11055); the rule "5 minutes to the first answer, no cap on the whole answer" of HAL-902

When a turn's model has a provider that can stream (`capabilities.streaming` and a `stream()` method), the engine shall make the model call through `stream()` and use the full response of its `done` event as the model's answer, with its text, tool calls, reasoning and usage; a provider that can't stream is called through `chat()` as before. A stream that ends without `done`, or goes on after it, shall fail the call as `refused`. A call that fails, with the reasons that move a turn on, before its first piece or after, shall move on to the next model like a failed `chat()` (requirement `engine.offline-falls-back`), and the turn's later calls shall stay on that model. The engine shall pass nothing of a stream on before it is whole, so a model that fails part way leaves nothing behind.

## Examples

- Given a model whose provider streams its answer in pieces,
  when a chat turn runs,
  then the answer is the `done` response, the provider's `chat()` is never called, and its tool calls run as from `chat()`.
- Given `smart` that streams a few pieces and then fails as offline, falling back to `local`,
  when a chat turn runs,
  then `local` answers and the log holds an `llm.fallback` from `smart` to `local`.
- Given a provider whose stream ends without `done`,
  when a chat turn runs,
  then the turn fails with `refused`.
