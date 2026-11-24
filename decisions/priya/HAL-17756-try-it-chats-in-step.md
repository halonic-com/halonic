# Decision: the Try it first load shows the saved chat

- Task: HAL-17756
- Approval: Liam asked for this change in his review of PR #5726 (HAL-16812) and reviews it on HAL-17756. It follows `agents.chat.saved`, already approved on HAL-16812.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:zuFrY4mygTPzOWS4AL2mLj/ASG+CpR9rsck2ezK7Hl7Gr5nDeEttj2X2PZNEK5G+8CKkaB6y04pS23Ev7QZeAA==

## What changes

`agents.chat.first-load` no longer says a Try it chat isn't kept in v0.1. Once the agent is read,
the chat shows the agent's most recently used saved Try it chat when there is one, and its empty
draft otherwise, as `agents.chat.saved` already says. One example is added for it. The loading,
error and Try again states stay as they are. No test is weakened or removed; no user-visible
string is added.

## Why

`agents.chat.saved` (HAL-16812) keeps Try it chats, so the two requirements disagreed.

## Covers

- agents.chat.first-load
