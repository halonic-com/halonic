# Decision: the bridge's approval request carries an optional connector

- Task: HAL-11852
- Approval: follow-up to HAL-11701, which the team agreed in HAL-11698 (add `connector` next to the bare `tool`)
- Kind: internal

## What changes

- `ports`: `BridgeApprovalRequest` and the `ask` variant of `BridgeToolCheck` get an optional `connector`. A tool that comes from no connector leaves it out; the bare `tool` name stays as it was.
- `engine.bridge-approvals`: the engine records that connector as the `connector` of `approval.requested`, as it does for the built-in loop.
- The GitHub and Paperclip write tools of the bridge name `github` and `paperclip`. The agent host's wire checks accept the new field.
- Approvals asked inside a `delegate_*` subagent already carried the connector from HAL-11701; a test now covers it.

No test was weakened or skipped.

## Why

`approval.requested` had no connector when the approval came from the harness bridge, so Studio's approval card couldn't say which connector asked.

## Covers

- engine.bridge-approvals
- harness-bridge.approvals
