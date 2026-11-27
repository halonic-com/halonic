# Decision: an open Inbox card that ended elsewhere shows its final state

- Approval: https://paperclip.ing/HAL/issues/HAL-19496
- Kind: user-visible

On HAL-10 the board asked for cards processed in Paperclip to update here and animate to their
final state (comment 20e30d36, 26 Nov). Liam approved the plan on HAL-19496: one final-state line,
the same in the Messenger, the Inbox and Needs you, whether the card was decided here or elsewhere.
Sofia's UX acceptance rows on HAL-20218 (row L4.2) record team decision G1 for the Inbox: when the
item that's open in the pane is decided elsewhere, it stays open, its answer bar becomes the
final-state line, and the buttons go.

Until now an open card that was answered elsewhere said "Answered elsewhere by Liam at 10:00:
No." with its buttons kept, off, and one that was cancelled or expired kept its buttons on. Now,
by the new requirement `inbox.final-state-open`, its bar is the kit's final-state line ("Approved
by Liam · 10:00", "Cancelled · 10:00"), with the answer after it when the line says only
"Answered", and no buttons. A card answered from this card keeps its own line ("Answered at
10:00: Yes."), and so does one whose answer came back as already answered, until the item is
read again.

One requirement changes with it:

- `inbox.question-cards`: the line that describes an answered form now reads "Answered by Liam ·
  18:43" when it was answered elsewhere, the final state; the ticked, unavailable form still says
  how. Its second example says "Answered by Liam · 18:43" in place of "Answered elsewhere by Liam
  at 18:43: Separate repo, Dark, Compact.". The form, the ticks and "no Answered 24 Nov" stay.

The tests that pinned the old line change with it, with the same number of checks:

- `agent-question-card.test.tsx`: "shows an answered card as ticked, disabled boxes" finds the
  line "Answered by Liam · 18:43" that describes the options, in place of the old line.
- `agent-items.test.tsx`: "shows an item answered in another client as answered elsewhere, by
  whom and how" expects "Answered by Liam · 10:00" followed by "No", and Yes gone in place of
  off; "turns an open card answered elsewhere as soon as the source says so" expects "Answered by
  you · 10:00" followed by "“Tomorrow”". Who answered and how are both still checked, as
  `inbox.agent-inbox-items` asks.

## Covers

- inbox.question-cards
- packages/studio/features/inbox/src/ui/agent-question-card.test.tsx
- packages/studio/features/inbox/src/ui/agent-items.test.tsx
