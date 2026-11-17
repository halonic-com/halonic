# Decision: approval.requested carries an optional connector

- Task: HAL-11701
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11698 (the team agreed option (a) there: add `connector` next to the bare `tool`)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5hcthnvJuwkgtF6V17ok8SVqLkbCWku0+mOAv5T34kTxI8+f3ni77Mra5OKTR40NZULp/HURQhoyfv/AGPMgDw==

## What changes

- `events.run-log-contract`: `approval.requested` gets an optional `connector` field next to the bare `tool`. The model-facing tool name stays bare. Run logs written before this change have no `connector` and stay valid. A contract test covers both shapes.

No test was weakened or skipped.

## Why

Studio's approval card (INBOX-CARD-24) must show which connector asked for approval. The bare tool name alone doesn't say so, and changing the tool name would change what the model sees.

## Covers

- events.run-log-contract
