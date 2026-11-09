# Decision: say why a model call failed, and log a skipped model

- Approval: Liam approved [plan-providers](/HAL/issues/HAL-1061#document-plan-providers) with changes on [HAL-1880](/HAL/issues/HAL-1880); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-1880

## What changes

`ports` gains `ModelCallError`, whose `reason` is `no-key`, `offline`, `model-missing`,
`model-no-tools` or `refused`, and `isModelCallError(value)`. The `@throws` docs of
`LlmProvider.chat()` and `stream()` say they throw it, that a stream gives the same reason as
`chat()`, and that any other error counts as `refused`. `ChatTurnResponse` gains an optional
`skipped` list (`ChatTurnSkip`).

The run log gains one event, `llm.skipped` (`agent`, `alias`, `provider`, `model`, `reason`,
optional `next`), and one optional field, `llm.response.toolCallAsText: true`.
`RunFailureReason` gains `model-missing` and `model-no-tools`. Nothing is renamed or removed. The
`events.run-log-contract`, `events.run-failed-reason`, `events.upgrade-old-run-logs` and
`events.timeline-entry-id` examples name the additions, and the type tests that pin them gain
them.

## Why

The engine's model fallback (PR 2 of the plan) has to tell "no key" and "offline", which move to
the next model, from "model missing", "no tools" and "refused", which stop the turn. Today
`chat()` only says it throws.

- `isModelCallError` checks `name` and `reason`, not `instanceof`, because an adapter may have its
  own copy of `ports` (Liam's change).
- `llmProviderVersion` stays at 1: the port gains an export and documentation, and a provider that
  throws something else still satisfies it; the caller reads that as `refused`.
- `events` and `ports` have no published version, so no version bump (Liam's answer to question 2).
- `llm.skipped` carries `alias` and `agent` on top of the plan's `provider`, `model`, `reason` and
  `next`: fallback entries in `models.yaml` are alias names, so `next` is an alias, and the screen
  line "smart: no key, using default" needs the skipped alias too. Every other `llm.*` event names
  its `agent`.
- `llm.skipped` stands alone in the timeline: a skipped model was never called, so no
  `llm.request` is open. A model that was called and was offline is logged with the existing
  `llm.fallback`.
- The only skip reason is `no-key`. A union of one keeps room to add one without changing the
  field.
- `toolCallAsText` is `true` or absent, never `false`, like a mark.

No test was weakened or removed.

## Covers

- events.run-log-contract
- events.run-failed-reason
- events.upgrade-old-run-logs
- events.timeline-entry-id
- events.llm-skipped
- events.tool-call-as-text
- ports.model-call-error
- ports.chat-turn-skipped
- packages/core/events/src/run-event.test.ts
