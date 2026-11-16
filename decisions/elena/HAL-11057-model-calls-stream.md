# Decision: the engine's model calls stream

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11055 (Liam's review of halonic#3165 asked for it; the rule is HAL-902)
- Kind: user-visible

`ModelChain` now calls a provider that can stream through `stream()` and answers with the full
response of its `done` event, so the answer carries the text, tool calls, reasoning and usage as
`chat()` gave them. A provider that can't stream (the mock model) is still called through `chat()`.

The behaviour change: a model now has **5 minutes to its first token, and no cap on the whole answer
while it keeps coming** (a silent stretch of 2 minutes still ends it). Before, Ollama sent nothing until
the whole answer was done, so the response limit capped the whole answer. The 5-minute default, the CLI
`within` and the requirement text were already set in halonic#3165.

Fallback and `noneLeftBecause` are unchanged. A stream that fails, before its first piece or after,
moves on like a failed `chat()`: the engine passes nothing of a stream on until it is whole, so a
model that fails part way leaves nothing behind, and this matches today's silent-reply case. A stream
that ends without `done`, or goes on after it, fails as `refused`.

No test was weakened. New requirement `engine.model-calls-stream` with five tests.

## Covers

- engine.model-calls-stream
- engine.offline-falls-back
