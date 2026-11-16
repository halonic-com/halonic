# Decision: the engine's model calls stream

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11055 (Liam's review of halonic#3165 asked for it; the rule is HAL-902)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Nm+1xXL/gxjSmI8UFTz+52I71FipqPkI7PZS/JSruEjsdWA+ytoNX6c9WUiVswUpwLa6FHO+SCCHfVfQjdhzAQ==

`ModelChain` now calls a provider that can stream through `stream()` and answers with the full
response of its `done` event, so the answer carries the text, tool calls, reasoning and usage as
`chat()` gave them. A provider that can't stream (the mock model) is still called through `chat()`.

The behaviour change: a model now has **5 minutes to its first token, and no cap on the whole answer
while it keeps coming** (a silent stretch of 2 minutes still ends it). Before, Ollama sent nothing until
the whole answer was done, so the response limit capped the whole answer. This PR also lowers the
default response limit of `model-openai` and `model-anthropic` from 10 to 5 minutes, and with it the
CLI `within` (`model-timeout` lines), the requirement texts, the READMEs and their tests. The limit ends
when the reply's headers arrive: for Ollama, which sends them with its first piece, that is the first
token; the cloud APIs send headers at once, so the 2-minute idle limit covers their wait for it.

Fallback and `noneLeftBecause` are unchanged. A stream that fails, before its first piece or after,
moves on like a failed `chat()`: the engine passes nothing of a stream on until it is whole, so a
model that fails part way leaves nothing behind, and this matches today's silent-reply case. A stream
that ends without `done`, or goes on after it, fails as `refused`.

No test was weakened. New requirement `engine.model-calls-stream` with five tests.

## Covers

- engine.model-calls-stream
- engine.offline-falls-back
- cli.run-failure
- model-anthropic.call-limits
- model-openai.call-limits
