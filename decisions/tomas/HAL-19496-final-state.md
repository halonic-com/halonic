# Decision: a card that ended shows its final state, then leaves the chat and Needs you

- Approval: https://paperclip.ing/HAL/issues/HAL-19496
- Kind: user-visible

On HAL-10 the board asked for cards processed in Paperclip to update in the Messenger and to
animate to their final state (comment 20e30d36, 26 Nov). The board's addition (comment 910fe451)
says the card then goes away: it is removed from the chat view and from "Needs you", not left in
place, and decided cards stay reachable from their task's history. Liam approved the plan on
HAL-19496 and agreed to change `messenger.inline-cards` through this note.

Until now an answered card stayed in the chat as a one-line record ("Approve, 12:10"), a card that
asked several questions stayed as a form with its picks ticked ("Answered 24 Nov"), and the Needs
you panel dropped an answered card at once. Now, by the new requirement `messenger.final-state`:

- a card that ends while shown, here or elsewhere, shows its final state ("Approved by you ·
  12:10", "Cancelled · 10:00") for 4 seconds, then settles out;
- a card that had ended before the chat showed it isn't shown; its task in Paperclip keeps it.

So three requirements change, each sentence about the old answered card replaced by a pointer to
`messenger.final-state`:

- `messenger.inline-cards`: only open cards sit in the timeline; an ended card shows its final
  state, then goes. Example 4 reads "Approved by you · 12:10" in place of "Approve, 12:10".
- `messenger.question-cards`: the ticked, disabled form of an answered card is gone. Example 2
  becomes "a card answered before the chat opened isn't shown".
- `messenger.needs-you`: a card leaves the count at once and the panel after its final state.

The tests that pinned the old behaviour change with them:

- `chat-cards.test.tsx`: the two quick-actions tests now expect the final state ("Approved by
  you · 10:00", "Answered by you · 10:00") in place of the card being gone. The motion test of the
  old fold-away into a record is removed with the fold-away; `final-state.test.tsx` tests the new
  motion, the hold and reduced motion.
- `inline-cards.test.tsx`: two tests expect "Approved by you · 12:10" and "Rejected by you ·
  11:30" in place of the records.
- `question-cards.test.tsx`: the submit test expects the final state, and "shows an answered card
  as ticked, disabled boxes" becomes "doesn't show a card that was answered before the chat
  opened".
- `needs-you.test.tsx`: "nothing is waiting" is said once the answered cards settled away, 4
  seconds later, on a fake clock.
- `chat-timeline.test.ts`: the `cardRecord` tests are removed with `cardRecord`, which nothing
  uses any more.

## Covers

- messenger.inline-cards
- messenger.question-cards
- messenger.needs-you
- packages/studio/features/messenger/src/ui/chat-cards.test.tsx
- packages/studio/features/messenger/src/ui/inline-cards.test.tsx
- packages/studio/features/messenger/src/ui/question-cards.test.tsx
- packages/studio/features/messenger/src/ui/needs-you.test.tsx
- packages/studio/features/messenger/src/chat-timeline.test.ts
