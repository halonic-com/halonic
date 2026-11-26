# Decision: a bad-answer refusal in the Inbox has no Try again

- Task: HAL-19374
- Approval: Liam asked for this in his review of #6422 (HAL-19350, [minor]); Liam signs this note in review
- Kind: user-visible

## What changes

`inbox.answer-refused` no longer offers **Try again** when the source refuses an answer with
`bad-answer`. The card shows "Couldn't record your decision. Your answer doesn't fit this card, so
answer it in Paperclip." instead. `not-found` refusals and failed sends keep "Couldn't record your
decision." with **Try again**. The requirement's example for `bad-answer` changes to match, and a
`not-found` example takes over the Try again case.

## Why

A source refuses the same answer the same way every time, so **Try again** on a `bad-answer` can't
help. The line builds on the approved "Couldn't record your decision." and says where the person can
still answer.

## Covers

- inbox.answer-refused
- packages/studio/features/inbox/src/ui/agent-item-refusals.test.tsx
