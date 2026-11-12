# Decision: compact an agent's memory after every forget and replace

- Approval: decision C258 on HAL-3295, carried into HAL-3299; the package owner's reviewer (Liam) approves this note in review
- Kind: internal
- Task: HAL-3299

## What changes

The `engine.agent-memory-records` requirement gains one sentence and two examples: after
`memory_forget`, or a save that replaces a note, `AgentMemory` compacts `agent-memory/<agentId>`,
so the store keeps no earlier text of that note. Saving a new title doesn't compact.

Nothing else in the requirement changes.

## Why

The `RecordStore` only appends, so a forgotten note's text stayed in the log. Compacting after
each replace and forget is what the token store does for `_tokens`
([ADR 2026-11-08](../../docs/adr/2026-11-08-record-store-compaction.md)). With the 100-note and
64,000-character limits (HAL-3079) a compact is cheap. Backups and copies stay outside the store,
as the ADR says.

The engine's test store now really compacts, and its `log` still records every change appended,
so the existing tests keep their assertions. No test was weakened or removed.

## Covers

- engine.agent-memory-records
- packages/core/engine/src/tools/agent-memory/agent-memory.test.ts
