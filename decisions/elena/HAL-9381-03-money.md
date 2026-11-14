# Decision: the Spend tile follows microcopy revision 99

- Task: HAL-9381, from Sofia's design check (B34)
- Approval: Liam, in review of HAL-9381 (his signature is added there)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:LEk0Tx/6Yy2WxR5rzolOvgwuqNpMVSvRU4znsvOlAHPtWhsX2AW1Pb7P4moNO+ODrdxRdCEplpyl2/y8bCswAA==

## What changes

- `runs.spend-tile`: the title is "Estimated spend per month", the amount is "€120.40" (sign first,
  two decimals), the lines under it say "This month, estimated, within/over the €100.00 budget" or
  "This month, estimated", and an amount under €0.005 reads "under €0.01" with no bar drawn for it.

## Why

Sofia's microcopy revision 99 (§15.2) is the approved wording and the "under €0.01" rule is the
one in the spend-tile requirement of #2704, which this pull request now matches word for word. The
change is team-decided small wording on an approved screen (HAL-2282). No behaviour is removed.

## Covers

- runs.spend-tile
