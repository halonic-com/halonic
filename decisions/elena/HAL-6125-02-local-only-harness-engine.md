# Decision: a local-only workspace refuses harness agents at run time

- Approval: Liam approves this note in review on [HAL-6125](/HAL/issues/HAL-6125) (his ask on HAL-6125, from his review of #1875 on HAL-6065)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kU8PQF5GDAvd0BROPOAfLRGbdzK9bXQAqfVHp42j6klSbidfmHAR6lfVDg5tp8QX9hfAmXJdh8I0XmdQTqg3Cw==
- Task: HAL-6125

## What changes

`engine.local-only` said it didn't yet cover an agent that runs in a harness program (Claude Code
or Codex): such a turn ran as before. That sentence is replaced: in a local-only workspace the
engine now refuses such an agent before its bridge, sandbox or harness starts, with a
`ModelCallError` whose reason is `local-only`. A chat turn throws it; a run fails with the reason
`local-only`. Two examples are added. Nothing else in the requirement changes.

## Why

A harness program calls its own model, which for both programs Halonic starts today is a cloud
model, and Halonic can't see or limit what it sends. A local-only workspace promises that nothing
leaves the computer, and `halonic init` is about to write `localOnly: true` (HAL-5922 PR 2). There
is no way yet to mark a harness as local; when a harness can run on a local model, it can get one
then, as a new requirement.

## Tests

New tests only (`packages/core/engine/src/run/local-only-harness.test.ts`); no assertion is
removed or weakened.

## Covers

- engine.local-only
