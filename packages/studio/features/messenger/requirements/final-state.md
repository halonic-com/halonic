# messenger.final-state

- Status: active
- Since: unreleased
- Source: HAL-19496 (board report on HAL-10, comment 20e30d36: a card processed in Paperclip should update here too and animate to its state; and its addition, comment 910fe451: after its final state it goes away, removed from the chat and from "Needs you"); plan approved by Liam

When a card the Messenger shows in a conversation's timeline or in the "Needs you" panel ends, because the person answered it here, or it was decided, cancelled or expired anywhere else, the Messenger shall change it in its place, without the rise of a new entry, to its final state, in the kit's words (`kit.final-state`), such as "Approved by Ada · 14:02", "Rejected by you · 14:02", "Answered by Chief · 14:02", "Cancelled · 14:02", "Expired · 14:02" or, for an action card, "Declined by you · 14:02", with its question muted and the link to its page in its source; a card decided here and one decided elsewhere shall look the same. The card shall leave the cards bar's count and the "Needs you" count at once. After 4 seconds it shall settle out of the timeline and the panel, as `kit.settle` says, the time pausing while the pointer is over it or the focus is in it; while the person prefers reduced motion it shall only fade. A card that had ended before the Messenger first showed it shall not be shown; its task in the source keeps it. The Messenger shall read the final state out once, through the view's one status region, except for a card the person answered here, whose answer it already read out. In "Needs you", once a card the person answered there turned into its final state, the focus shall move to the next card's first option, or else to the panel's title.

## Examples

- Given Chief's open card "Merge #12?" in his chat,
  when Ada approves it in Paperclip at 10:00,
  then the card shows "Approved by Ada · 10:00" without its buttons, and 4 seconds later it is gone.
- Given Chief's open card in his chat,
  when it is decided elsewhere,
  then it changes where it is, with no motion, and its question is muted.
- Given two of Chief's open cards,
  when the person approves one here and approves the other in Paperclip,
  then both show "Approved by you · 10:00".
- Given Chief's open cards,
  when one is cancelled and another expires,
  then they show "Cancelled · 10:00" and "Expired · 10:00".
- Given a card that shows its final state,
  when the person holds the pointer over it for 10 seconds,
  then it stays until 4 seconds have passed without the pointer.
- Given "Needs you" with Chief's open card,
  when the card is decided elsewhere,
  then the count is gone at once, the panel shows the card's final state, and 4 seconds later says nothing is waiting.
- Given a person who prefers reduced motion,
  when a card settles out,
  then it only fades.
- Given Chief's open card in his chat,
  when Ada approves it in Paperclip,
  then the chat reads out "Approved by Ada · 10:00" once.
- Given Chief's open action card,
  when the person declines it,
  then it shows "Declined by you · 10:00", not in the success tone.
- Given "Needs you" with two of Chief's open cards,
  when the person approves the first there,
  then the focus moves to the second card's first option.
