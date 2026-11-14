# Decision: a changed workspace and a failed trust check get their own wording

- Approval: Sofia's design check on HAL-9316 (section B1, B2); HAL-9384 asks for this wording on approved microcopy revision 96
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DTN/jG6G2L7bOXpNCgmpptBJJzc9jJC/vD/+V/61AN2Ie3c8teFzCbdXC7lhTEfXUjS31lhLit73qW7ZX24zAA==
- Task: HAL-9384

## What changes

`studio.workspace-trust-status` adds the status `failed` (with the reason) and the badge states
`changed` and `failed`. `workspace.trust-section` now says "Loading workspace settings" before the
first check, and "Couldn't load workspace settings · reason" with **Try again** when the check
couldn't run. The header badge says "Changed since you trusted it · Review changes" for a workspace
that changed, instead of "Not trusted yet · Review".

## Why

One state was worded two ways, and a failed check showed nothing at all.

## Covers

- studio.workspace-trust-status
- workspace.trust-section
