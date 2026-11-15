# Decision: the local harness host copies a run's instructions into a folder of its own

- Task: HAL-3106 (migration plan step 2), pull request #2917
- Approval: HAL-10210, Liam's review of #2917
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:URzgnu/PgV16l7Z+X0Y/sAz0d1ft+o6QTRRhfUtWnYq4q7lhqu/VzMptpevSxKWJZSsv0c9T/rRPg4T1gewcAw==

## What changes

`cli.local-harness-host` gains one sentence: the run's instructions (the agent's `instructions` and selected skills) are copied read-only into a folder inside the harness temp root and pinned for the run log, so an engine that stopped leaves nothing after the next open. Nothing the requirement promised before is removed or weakened.

`harness-kit.instruction-snapshot` gains one sentence and one example: for a harness run the kit takes the instructions from the agent's file as the call read it, with `instructions` as `AGENTS.md` and each skill as `skills/<id>/SKILL.md`. With neither it gives no pin and writes nothing, and a skill with no text fails the call before the harness starts. Nothing it promised before is removed or weakened.

## Why

A harness run has to see the instructions that were pinned, not files that change under it, and the run log has to say which ones they were.

## Tests

No test was weakened or removed. `run-instructions.test.ts` is new and covers the added sentence.

## Covers

- cli.local-harness-host
- harness-kit.instruction-snapshot
