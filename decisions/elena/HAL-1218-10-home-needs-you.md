# Decision: the Inbox page opens the item Home's Needs you asked for

- Approval: Home's Needs you is part of [HAL-1218](/HAL/issues/HAL-1218); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:sb0oyiPLREUQMhbsevCfPAk2UGMVSzxqOqE97XCLJSfIqskmYHNFoV5F19L1UMi1W7tA9b0Zcks9hw2MjBsFCQ==
- Task: HAL-1218

## What changes

`inbox.page` gets one clause: nothing is open when the page opens, unless Home's Needs you asked
for an item; then that item's card is open. Nothing else in the requirement changes, and no example
was removed or weakened.

## Why

A Needs you row on Home opens its item in the Inbox (UX checklist part 1, 1.9 and 1.15). Without
this clause the Inbox would open with nothing selected, and you would have to find the same item
again in the list.

## Covers

- inbox.page
- packages/studio/features/inbox/src/ui/needs-you-card.test.tsx
