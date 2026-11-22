# Decision: the listener requirement says 32 waiting frames, as the code does

- Task: HAL-16383
- Approval: Liam signs this note on HAL-16383; the docs follow the code and no behaviour changes (follow-up from HAL-16344)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8c6Utd87T8r9fVqdckpEIuqCk/8J/gw6B0GBcerJqt5d2XXs9Jdzv8SdjCCRuwkfRxQmFep9ejGKYxOXDOVAAA==

## What changes

`remote-gateway.listener` said a connection is closed when more than 16 frames wait for their turn.
The code allows 32: `maxPendingFrames` in `packages/adapters/remote-gateway/src/gateway-connection.ts`
counts the frame being handled too, and closes the connection when the 33rd frame arrives. The test
"closes the connection when more frames wait than it allows, behind a slow answer" in
`gateway-connection.test.ts` pins exactly that: 32 frames wait without a close, the 33rd closes.
The requirement sentence now says "more than 32 frames waiting for their turn, the one being handled included".

## Why

The requirement and the code disagreed, and the code and its test agree with each other. The
requirement is the one that is wrong, so it is the one that changes. Nothing in the code, the tests or
the protocol changes, so no user sees a difference. Choosing 16 instead would be a behaviour change
(a slower phone would be cut off sooner) and needs its own task.

## Tests

No test is added, removed or loosened.

## Covers

- remote-gateway.listener
