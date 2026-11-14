# Decision: blocked sites show as a row under the step and in the failed banner

- Task: HAL-9381, from Sofia's design check (B31)
- Approval: Liam, in review of HAL-9381 (his signature is added there)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XYg1Javc+s838ojEAh9X6AEpmx0pAgNTel+iUsv2LYdpqwY21PaLplKw6p81QB690rx+ce7s0UJaP8btyEZ/Bw==

## What changes

- `runs.run-view.blocked-sites`: the "Blocked 3 sites" line is a row in the step's timeline (not a button) that opens the step's entry; the failed banner for a run stopped by blocked sites names the site with the most tries and offers See the step.

## Why

The words are Sofia's microcopy revision 99 (15.2, 15.3, 23.2), which the approved design check asked for. The change is team-decided small wording on an approved screen (HAL-2282). No behaviour is removed.

## Covers

- runs.run-view.blocked-sites
