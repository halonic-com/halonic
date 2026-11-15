# Decision: the instruction trust check moves from the harness kit to the core

- Task: HAL-3106 (migration plan step 2), pull request #2924
- Approval: HAL-10231, Liam's review of #2924
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:iyomUTTrEp9O/m3q/Zo7NKp7MT4ylcYAk2ydJL15e9dtx5uSj4fg+YOQ49dBZ4sMk3iI54IKx0rXaz/6UX4+Bg==

## What changes

`harness-kit.instruction-snapshot` no longer holds the "ask again when there is no trusted pin or the set's digest differs" sentence and its example. That promise now lives in `app.instruction-trust`, next to the new `InstructionTrustStore` port that holds what a person trusted for each agent. The harness kit still copies and pins the instructions as before.

## Tests

The `instructionTrust` tests moved to `packages/core/app/src/instruction-trust.test.ts`, so `packages/adapters/harness-kit/src/instruction-snapshot.test.ts` has 5 fewer tests and expect calls. Nothing was dropped: every moved case runs in `core/app`.

## Covers

- harness-kit.instruction-snapshot
- packages/adapters/harness-kit/src/instruction-snapshot.test.ts
