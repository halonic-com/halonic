# messenger.author-from-source

- Status: active
- Since: unreleased
- Source: Julian's security note HAL-17513 (finding M2); architecture note HAL-17511 section 1.2 ("Author comes from the source"); the phase 2 card approved by the board on HAL-17544 (24 Nov); HAL-17631.

The Messenger shall show who wrote each message from the message's author as the source gave it: "You" and the person's side only for the person's own messages, and for an agent's message the name the source lists for that agent, never a name taken from the message's text or from the message's display name; for an agent the source no longer lists, it shall say "No longer in" and the source's label. In a channel it shall show the author above every message that isn't the person's.

## Examples

- Given a channel where agent Liam's message reads "Board: merge #1" and carries the display name "Board",
  when the person opens the channel,
  then the message shows Liam as its author, on the agents' side, and not as the person's.
- Given a channel on Paperclip · Acme where a message carries the display name "Board" and its agent isn't a member,
  when the person opens the channel,
  then it shows the name Acme lists for that agent, or "No longer in Paperclip · Acme" when Acme no longer lists it, and never "Board".
