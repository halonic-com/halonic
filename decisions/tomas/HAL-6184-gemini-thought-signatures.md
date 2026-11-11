# Decision: the OpenAI-compatible adapter keeps Gemini's thought signatures

- Requirements: `model-openai.replies`, `model-openai.request`
- Task: HAL-6184, from Liam's review on HAL-6102
- Approval: Liam asked for this on [HAL-6184](/HAL/issues/HAL-6184) and approves this note in his
  review of this pull request
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:w1G4z6n3t1DubMf64rfkGs5xvUWcsbBSToDANjSCW0FIVkIZdbUDacTwqnZcrPbdb73wUZ0B++ph2CTytzdIAQ==

## What changes

`model-openai.replies` gains one sentence: a thought signature a server sends with a tool call in
`extra_content.google.thought_signature`, whole or streamed, is kept as the call's `signature`.
`model-openai.request` gains one sentence: a tool call with a `signature` is sent with it in the
same place, and a call without one gets no `extra_content`. Nothing that was required before
changes, and no example is removed.

## Why

Gemini's OpenAI-compatible API (`generativelanguage.googleapis.com/v1beta/openai`) signs the
reasoning behind a tool call and puts the signature on the call. Google's thought signatures guide
says Gemini 3 models answer 400 ("Function call ... is missing a `thought_signature`") when the
first tool call of a step in the current turn comes back without it. The adapter dropped it, so an
agent with tools on Gemini 3 failed on its second model call. The port already had
`ToolCall.signature` for this, and the engine copies tool calls onto the stored assistant turn
unchanged, so only the adapter needed to change.

Only a server that sent a signature gets one back, so OpenAI, Ollama, LM Studio and other servers
never see the field. When a turn has no signature (a model switch to Gemini mid-turn), nothing is
sent; Google's dummy value for that case is left out on purpose until we see it needed.

## Tests

No test was weakened. New tests: a whole reply keeps the signature on the first of two parallel
calls (`reply.test.ts`), a streamed call keeps it without adding it to the events
(`stream-reply.test.ts`), and a request sends it back only on the call that has one
(`request.test.ts`).

## Covers

- model-openai.replies
- model-openai.request
