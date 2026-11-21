# Decision: Try it's reply line offers Try again only once the engine answers again

- Task: HAL-13177
- Approval: decided by the team on HAL-13177 (states H12 and H13 of HAL-5896, approved by the board; Noah's design check C446 on HAL-14656 asks for them). Liam signs on review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:h46P5710dPRAvdThNDkxRJtjWuzIjamB5wGMpcgB2NhDxz2VBZdIYWMzxjf5Yx13v5QnT8Qb26uTmbaNkPBgAw==

## What changes

`agents.chat.reply-ends` (added in the PR below this one, not on `main` yet) said "Stopped when
Halonic's engine stopped." comes with **Try again** straight away. Now **Try again** shows once
the engine answers again, as state H13 says; until then the chat shows H12's line and Send waits
(`agents.chat.engine-quiet`). One clause of the requirement changes.

`try-it-chat.test.tsx` had grown past the 500-line limit, so its engine and trust tests move to
`try-it-engine.test.tsx` and its helpers to `try-it-test-support.tsx`. No test is removed or
weakened: each requirement keeps the same tests, in a file by topic.

## Why

Offering **Try again** while the engine isn't answering sends a message that can only fail
again. The approved states keep the message and wait for the engine instead.

## Covers

- agents.chat.reply-ends
- packages/studio/features/agents/src/chat/try-it-chat.test.tsx
