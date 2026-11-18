# Decision: the gateway's approval names its connector

- Approval: follow-up to HAL-11852, task HAL-12135 (carry the bridge approval's `connector` into the agent host's run ledger)
- Kind: internal

## What changes

- `ports`: `GatewayApproval` of the remote gateway protocol gets an optional `connector`. The protocol is unreleased and the phone only reads this field, so the version stays 1.
- `agent-host.gateway-run-ledger`: the ledger copies the `connector` of a bridge's `BridgeApprovalRequest` and of the run's `approval.requested` event into the approval it records, and leaves it out for a tool that comes from no connector. The requirement gains one sentence saying so; nothing else in it changes.

No test was weakened or skipped.

## Why

Since HAL-11852 the bridge's request names the connector, but the ledger dropped it, so a remote device's approval card couldn't say which connector asked, while Studio's card could.

## Covers

- agent-host.gateway-run-ledger
