# Decision: a start of a missing hub, workflow or agent answers one code per kind

- Task: HAL-195
- Approval: Liam approves this note in review on the review task of this pull request
- Kind: internal

## What changes

`server.trust-gate` said a start of a missing hub, workflow or agent answers 404 with the one code
`run_target_not_found`. It now answers 404 with `hub_not_found`, `workflow_not_found` or
`agent_not_found`, each with a fixed message that names nothing. The `trust-gate` test that checked the
old body now checks the new one for all four cases (hub and workflow at `/api/runs`, hub and agent at
`/api/agent-runs`). Nothing is weakened: each case still checks the status and the exact body, and that
the secret in the cause is not in it.

## Why

The remote run executor (HAL-195 10d) must throw `RunTargetNotFound(kind, id)`, as the port and the
`RunExecutor` contract suite require. With one code it can't tell a missing hub from a missing
workflow. The caller already knows the id it sent, so the kind tells it nothing about the host beyond
what a signed-in caller learns from any 404. Separate codes keep the error body at "code plus message".

## Tests

No test is skipped or deleted. Four cases change their expected body.

## Covers

- server.trust-gate
