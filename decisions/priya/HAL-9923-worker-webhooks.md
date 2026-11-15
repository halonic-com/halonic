# Decision: the Worker finds a webhook's routine in the snapshot

- Requirements: `runtime.serve`
- Task: HAL-9923, from HAL-9922 (for HAL-6706)
- Approval: HAL-9923, Liam's task; Liam reviews and signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:yPmTAoVfNjCy6z1tU5g0ZqI1VdWbThmNMBtRO9nPWnY/qrmP/v3UGxQqJG5EAo6hUVENlipTraAggb1vOnYdCA==

## What changes

The requirement said no routine is found for a webhook yet. Now the Worker reads the routines of the
uploaded snapshot at every delivery and hands the one at the address to the shared webhook checks of
`host/server`. Nothing is weakened: the signature, the time window, the replay refusal and the single
neutral answer for an unknown address, a switched-off routine and a bad signature are the same code as
on the Node host. The Worker still starts no runs, so a signed delivery answers 501 and its delivery id
is not used up.

## Why

HAL-6706 (3c) and the live harness's webhook checks need a Worker that accepts a signed webhook.

## Covers

- `runtime.serve`
