# Decision: the engine refuses models and connectors that aren't local in a local-only workspace

- Approval: Liam's decision on [HAL-5921](/HAL/issues/HAL-5921) (from Maya's finding on HAL-5915: the accepted ADR `docs/adr/2026-11-08-local-first.md` stands and the code follows it); Liam approves this note in review on [HAL-5922](/HAL/issues/HAL-5922)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:GIwVOBJ1Q3bccRa+byQxfdw58GL/BLQAXfK/7TINVIx8Rp9H+tVcw0jp3wbdwN/e3CPBsjA9k0AWtgXqzXZ5CA==
- Task: HAL-5922

## What changes

A local-only workspace (`privacy.localOnly: true`) now has a reason of its own wherever the engine
says why it skipped a model or why a run failed. Each list below gains `local-only` and loses
nothing:

- `ports.model-call-error`: `ModelCallErrorReason` has ten reasons; `local-only` is the engine's
  own, for a model it didn't call.
- `ports.chat-turn-skipped` and `events.llm-skipped`: `ModelSkipReason` is `no-key` or
  `local-only`.
- `events.run-failed-reason`: `RunFailureReason` gains `local-only`, with its own requirement
  `events.run-failed-local-only`.

Older run logs read as before. A reader that doesn't know `local-only` meets it only in logs of
local-only workspaces, which this engine writes from now on.

## Why

The ADR says nothing leaves the computer in a local-only workspace, but nothing read the setting.
The engine skips a model that isn't local the way it skips a model without its key, so the log and
a chat turn's `skipped` say which model was refused and why, and a run with no local model left
fails with a reason the CLI can word ("Acme is local only, so Halonic sent nothing to …"). Reusing
`no-key` or `error` would tell the person to set a key or report a bug.

## Tests

The type tests that list each union exactly gain `local-only`: "has exactly the ten reasons"
(was nine), the `ChatTurnSkip` reason, the `ModelSkipReason` list and the `RunFailureReason`
list. No assertion is removed and no other test changes.

## Covers

- ports.model-call-error
- ports.chat-turn-skipped
- events.llm-skipped
- events.run-failed-reason
- packages/core/ports/src/model-call-error.test.ts
- packages/core/ports/src/chat-turn-result.test.ts
- packages/core/events/src/run-event-fields.test.ts
- packages/core/events/src/run-failure.test.ts
