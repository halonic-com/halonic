# messenger.inline-cards

- Status: active
- Since: unreleased
- Source: the board's decision on HAL-10 (25 Nov), HAL-18471; HAL-18473; one bar per channel, HAL-18483; an ended card goes away, the board's addition on HAL-10 (comment 910fe451), HAL-19496

The Messenger shall show each open card of a conversation (the cards `messenger.quick-actions` shows) in the conversation's timeline, where its `createdAt` falls among the messages, and no card above or below the messages. When a card ends, it shall show its final state in its place and then go, as `messenger.final-state` says. While any of a direct chat's cards is open, the Messenger shall show a bar under the messages saying "3 cards waiting", or "1 card waiting" for one; it shall show no bar while none is open, and none in a channel, which shows the bar of `messenger.channel-waiting` instead. When the person presses the bar, the Messenger shall scroll to the oldest open card and put focus on its first option. When the person opens a conversation, the Messenger shall show its latest message or card. The Inbox shall keep listing every agent's cards.

## Examples

- Given Chief's chat with the messages "Morning" at 9:00 and "Done" at 11:00, and Chief's open card "Merge #12?" made at 10:00,
  when the board opens the chat,
  then the timeline shows "Morning", then the card, then "Done".
- Given Chief's chat with 50 open cards,
  when the board opens it,
  then it shows the latest entry, and the bar under the messages says "50 cards waiting".
- Given the same chat,
  when the board presses "50 cards waiting",
  then the chat scrolls to the oldest card and focus is on its first option.
- Given the same chat,
  when the board answers a card with Approve at 12:10,
  then the card shows "Approved by you · 12:10" in its place and the bar says "49 cards waiting".
- Given Chief's chat with one open card,
  when the board answers it,
  then the bar is gone.
- Given a channel with 2 open questions,
  when the board opens it,
  then it shows "2 waiting for you" and no "cards waiting" bar.
