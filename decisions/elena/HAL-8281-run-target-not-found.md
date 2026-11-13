# Decision: a start for a hub, workflow or agent that doesn't exist answers 404, not 500

- Approval: HAL-8281, from Liam's review of #2396 (HAL-8252, item 3); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-8281

## What changes

The `server.trust-gate` requirement gains one sentence: a start that the executor rejects with
`RunTargetNotFound` answers 404 with the code `run_target_not_found` and a fixed message that names
nothing. Before, it answered 500, like a real failure. Every other failure of a start still answers
500.

Nothing else in the requirement changes: the gate is still asked first, and a start the gate refuses
still answers 403.

## Why

A wrong hub, workflow or agent name is the caller's mistake, not a server fault. A 500 tells a script
or an app to retry or report a bug; a 404 says the name is wrong. The message stays fixed so the
answer doesn't confirm which names exist in a workspace.

No test was weakened or removed; the trust-gate tests gain a case for the unknown workflow.

## Covers

- server.trust-gate
- packages/host/server/src/trust-gate.test.ts
