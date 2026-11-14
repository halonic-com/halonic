# Decision: Inbox answers that Studio can't send show a command to copy

- Approval: wording and scope decided by the team on HAL-9369 (from Sofia's design-check, HAL-9316 A1/A2); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-9369

## What changes

`inbox.approval-card` now says what the card shows when Studio can't send an answer itself: the
executor's sentence, the command line that sends it in code style with **Copy command**, and no
**Try again**, because a retry can't work. The card stays waiting. In the "Ask for changes" dialog
the same case shows "The command sends Reject without your note." and the command to copy. One
example is added for it. No existing example was removed or weakened.

`inbox.wait-card` says the same for an answer only the command line can send: the sentence and the
command to copy instead of **Try again**.

## Tests

The "asking for changes" tests moved from `approval-card.test.tsx` to
`approval-card-changes.test.tsx`, and the shared setup to `approval-card.test-helper.tsx`, because
the file passed the 500-line limit. The moved tests are unchanged, so none were lost: 28 before,
20 in `approval-card.test.tsx` plus 8 in `approval-card-changes.test.tsx` after.

## Why

A tool approval that Studio can't send used to end in a "Try again" that could never work, and an
empty Runs view had a dead button. Sofia's design check found both as dead ends. Showing the exact
command to copy gives the person a way forward.

## Covers

- inbox.approval-card
- inbox.wait-card
- packages/studio/features/inbox/src/ui/approval-card.test.tsx
