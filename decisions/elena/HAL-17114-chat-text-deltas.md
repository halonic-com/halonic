# Decision: a chat turn's text is passed on as the model writes it

- Approval: HAL-17113 (Liam approved the streaming plan on HAL-17106; this is its PR 1, HAL-17114)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:rhQvQ8i3fd7ZKvoDPdGhSdc+DINDGinUZPazbb6aFlwUoikzFGWiIiiwBw78LqQgSJbPa3QQvgRwkG/kLNcgAQ==

`engine.model-calls-stream` said the engine passes nothing of a stream on before it is whole. The approved streaming plan passes a chat turn's text pieces to the request's new `onText` listener as they come, for display only. The requirement now says that nothing of a stream becomes the answer before it is whole, so a model that fails part way still leaves nothing behind in the turn, and that only `onText` hears the text, with a `restart` that throws it away (the new requirement `engine.chat-text-deltas`). Its examples and tests are unchanged.

## Covers

- engine.model-calls-stream
