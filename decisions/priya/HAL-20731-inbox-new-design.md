# Decision: the Inbox's list column has no fixed width in `inbox.proposal-page`'s examples

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20617 (the approved build plan, P3 and P5); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3KhC6V62DBLV9QMnWwRl8nRHobrdnvz9zLcfIEBGhO8XgZkf+iaMG+jG8b0tI//e5zmiW/mxZ/Sp3t/w/qG7DQ==
- Task: HAL-20731

## What changes

- Two examples of `inbox.proposal-page` said "the 360 px list". They now say "the list column",
  with no width. The rule and the examples' outcomes don't change.

## Why

The build plan (HAL-20617, P3 and P5) sizes the list column at 34 % of the page, at most 380px
(`inbox.list-column`), so it is no longer 360px. The examples are about a title that wraps or is
cut in the list, which holds at any column width.

## Covers

- inbox.proposal-page
