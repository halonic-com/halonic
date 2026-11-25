# messenger.open-at-newest

- Status: active
- Since: unreleased
- Source: the board's report on HAL-18736 (HAL-10, 25 Nov, 18:42 UTC): opening another chat showed its top first, then jumped to the bottom a few seconds later.

When the person opens a conversation, the Messenger shall show it at its newest entry from the first paint of its messages, with no scrolling motion, whether or not the conversation's cards have been read yet or their read failed. When the cards land later, they shall take their place in the timeline without moving a person who is at the newest entry away from it, and without counting as new messages. While the person is at the newest entry, within 24 px, the conversation shall stay there when its entries grow, such as when a picture or a long message takes its size.

## Examples

- Given Chief's chat with 60 messages, whose cards are still being read,
  when the board opens it,
  then the newest message is scrolled into view on the first paint, with no smooth scroll.
- Given the same chat,
  when its cards then land,
  then the chat stays at its newest entry and shows no "new message" pill.
- Given a chat whose cards can't be read,
  when the board opens it,
  then it still opens at its newest message.
- Given the board at the newest entry,
  when the transcript grows taller,
  then the chat scrolls to the new end.
