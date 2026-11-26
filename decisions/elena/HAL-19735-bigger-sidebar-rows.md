# Decision: the Inbox's list rows show the sidebar's 60px picture, not 28px

- Approval: /HAL/issues/HAL-19735
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:H92JJZr5XVtqX1nIUZ77zC2OnXniAgR+LzgfBTNQPmjaUlu6xNQXKJMD+mGj5avnBkfphDp0y/mFJYwHw2M+DQ==

## What changes

- `inbox.header-avatar`: its last sentence and its second example said the list's rows keep
  their 28px pictures. They now say the rows keep their own 60px sidebar pictures
  (`kit.plain-row-size`). The open item's 40px header picture doesn't change.
- `packages/studio/features/inbox/src/ui/inbox-shared-look.test.tsx`: the test for that example
  checks `size-15` (60px) instead of `size-7` (28px). It checks the same row, just at the new size.

## Why

The board decided on HAL-10 (26 Nov) that the Inbox's and the Messenger's sidebar rows grow to
80px with a 60px picture (HAL-19735). `inbox.header-avatar` landed in #6530 while this pull
request was open, and wrote down the old 28px row size, which this change replaces. The
requirement's point, that the list's rows keep their own size when the header gets its 40px
picture, stays.

## Covers

- inbox.header-avatar
- packages/studio/features/inbox/src/ui/inbox-shared-look.test.tsx
