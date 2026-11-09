# Decision: `sandbox.started` and `harness.started` run log events

- Approval: failure-path rule 1 in the [HAL-1668 decisions](/HAL/issues/HAL-1668#document-decisions); stack 1a of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), approved by Liam on [HAL-1967](/HAL/issues/HAL-1967); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-189

## What changes

The run log gains two events:

- `sandbox.started`, with `state`, `agent` and `timeoutMs`;
- `harness.started`, with `state`, `agent`, `harness` (the agent's harness id) and `timeoutMs`.

Nothing is renamed or removed. The `events.run-log-contract` example that lists the events added
since the reference now names them, and the type test that pins the list gains both.

## Why

The failure-path rules say every wait is visible and every wait ends. The engine writes these
events before it opens a sandbox or starts a harness program, so a screen can say what a step
waits for, and for how long, before anything comes back. `timeoutMs` is required: every start has
a limit (30 s and 60 s by default, plan stack 4c), so there is no "no limit" case to model.

Owen's `connector.started` (HAL-1728) follows the same shape: `state`, `agent`, the thing being
started, and `timeoutMs`.

Both events open a timeline entry of their own. They aren't paired with a later event, because
that would change the `events.timeline-entry-id` table, and a harness has no single "first event"
type to pair with. Older logs have neither event and read as before.

No test was weakened or removed.

## Covers

- events.run-log-contract
- events.started-events
- packages/core/events/src/run-event.test.ts
