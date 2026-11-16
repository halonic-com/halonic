# Decision: a dismissal keeps other windows' dismissals and forgets gone notices

- Approval: a team decision by Liam (CTO) on HAL-10890, the review of this pull request; it fixes how the approved Dismiss is stored, with no new flow, screen or wording; Liam signs this note with the pull request
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:m07xxAx2fZcyjN+7HUWoGuDgEJzSmiQaz+wn+jovkVEuXWHoUMBQRpjUhznSB+1JAcdjmcRbSb4fbRuy7VV6Dw==
- Task: HAL-1305 (part 9)

## What changes

`studio.inbox-notices`: before a dismissal is written and before gone notices are pruned, the window reloads the dismissals stored for the workspace and merges them in, so one window's dismissal no longer undoes another window's. A stored key whose notice is no longer in the run logs is forgotten. Two examples cover both. Nothing was removed or weakened.

## Why

These are the two follow-ups from the review of #3121: two windows on the same workspace could overwrite each other's dismissals, and the stored keys grew forever.

## Covers

- studio.inbox-notices
