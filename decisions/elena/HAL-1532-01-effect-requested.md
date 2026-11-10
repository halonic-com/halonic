# Decision: the run log gains effect.requested

- Requirements: `events.effect-requested` (`packages/core/events/requirements/effect-requested.md`),
  `events.run-log-contract` (`packages/core/events/requirements/run-log-contract.md`)
- Task: HAL-1532, step 4(c) of the [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan)
- Approval: the plan and the port ADR (`docs/adr/2026-11-07-port-list-and-versions.md`, "Run log additions") ask for this record; the maintainer approves this note in review
- Kind: internal

## What changes

The run log gets the "effect requested" record the port ADR lists among the run log additions that
come with the engine: an `effect.requested` event, written before a connector call that can change
things. A call with this event and no `tool.result` after it may or may not have done its work, so
the engine records its outcome as `unknown` instead of making the call again on its own.

`events.run-log-contract`: its first example lists the events added since the reference, each with
its own requirement. It now also names `effect.requested` (`events.effect-requested`), as HAL-1728
did for `connector.started`. No reference event or field changes.

## Tests

No test was weakened. The exact list of event types in `run-event.test.ts` gains `effect.requested`,
and `effect-requested.test.ts` pins its fields and that it needs `idempotencyKey`.

## Covers

- events.run-log-contract
- events.effect-requested
- packages/core/events/src/run-event.test.ts
