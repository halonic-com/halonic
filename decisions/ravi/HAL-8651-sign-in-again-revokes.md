# Decision: signing in again revokes and drops the old grant

- Approval: HAL-8651 (Liam, CTO)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/cNyFpGI2kdIJpPvMc7D56bSkcdK+ZE5No4OlKB0C1yt0pUd3KtX1uDWvZc43Myh6ASPg2O3b7dLBcVT0qu/Bw==

Signing in again signs the old grant out before the new one is saved: it is revoked at the
URL it was approved with, then dropped. This is what the HAL-984 design says; the flow did not
do it yet.

## Covers

- `integration-sign-in.sign-in-flow`

## What changes

- The requirement now says a saved grant is signed out when a new sign-in finishes. A revoke the
  provider doesn't confirm still drops the grant, and the outcome says so.
- A new sign-in that is refused leaves the old grant alone.
- A grant whose sign-in changed is not dropped when the tokens refuse it. It is revoked and
  dropped when the user signs in again or signs out.

## Why

Without this, signing in again left two live grants at the provider and the old one was never
revoked.
