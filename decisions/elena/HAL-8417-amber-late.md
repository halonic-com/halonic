# Decision: "have a look" is amber, in the kit Callout and in the connection states

- Approval: the board's design decision on HAL-8416
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Dms+5k5UuvQWyuS+9t7cUXu1o+G7gFLQDdir7B0EWmeee9J2a7IcDQiqPSXJaIsn9bXjyeKerGaPR9ad2u2wBg==
- Task: HAL-8417

## What changes

`kit.callout` gets a fourth tone, `attention` (amber fill and icon, the same amber as the status
chip), next to `info`, `warning` and `danger`. It is for "have a look": over budget, late.

`library.connection-state` now gives amber (`attention`) to the three states that need action
and to Not connected. Connected stays success. The tone `neutral` is dropped from
`ConnectionTone`, because nothing uses it any more. The labels and the order in which the
function names what to fix first do not change.

## Why

The board decided on HAL-8416 that amber means "have a look" everywhere in Studio. The run page's
budget stop used the `warning` tone, which says "part of this worked", and Not connected was
grey, which read as "nothing to do".

## Covers

- kit.callout
- library.connection-state
