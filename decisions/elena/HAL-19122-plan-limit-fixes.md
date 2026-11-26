# Decision: the plan-limit card answers a Continue that changed nothing

- Task: HAL-19122
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19110 (Noah's visual check of #6330 and #6328, item 1; words checked by Sofia on a child task of HAL-19122)
- Kind: user-visible

## What changes

`inbox.plan-limit-card` said that when the run still waits at its plan limit after **Continue the
run**, the card stays as it was, with no new error. It still does, and now also shows one quiet line
over its buttons, said to a screen reader too: "This run is still at your plan's limit. It resets on
{day}.", without the second sentence when the stop gives no day. The example for that case gains the
line.

The test for that case (`packages/studio/features/inbox/src/ui/plan-limit-card.test.tsx`) no longer
checks that the card's whole text is unchanged, since the line is new; it checks that the title is
unchanged, no error shows, the line shows and is announced, and Continue is still there. No test is
skipped or deleted.

## Why

Without it the button showed "Continuing the run…" and went back to the same card, which reads
like a broken button, and a screen reader heard nothing (Noah, HAL-19110).

## Covers

- inbox.plan-limit-card
