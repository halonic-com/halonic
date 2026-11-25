# messenger.chat-rows

- Status: active
- Since: unreleased
- Source: design review HAL-18481 (improvement 4), approved by the board on HAL-10 (25 Nov, 13:28 UTC); HAL-18556.

The Messenger shall show, in each row of its list, under the conversation's name, the first line of its newest message, with "You: " first when the person wrote it, and the newest message's time on the right. While the chat agent has open cards, the row shall show a chip saying "1 card", or "2 cards" for two. While the newest message is an agent's and the person hasn't had the conversation open since it came, the row shall show a dot, read out as "Unread"; the dot shall be gone once the conversation was open. A chat's row shall name its source only while the list holds conversations from more than one source.

## Examples

- Given Chief's chat, whose newest message "Shall I merge #12?" came at 9:30,
  when the board opens the Messenger,
  then Chief's row says "Shall I merge #12?" and "09:30", with the dot.
- Given the same chat,
  when the board opens it, then opens Liam's chat,
  then Chief's row has no dot.
- Given Chief has two open cards,
  when the board opens the Messenger,
  then Chief's row shows "2 cards".
- Given one source,
  when the board opens the Messenger,
  then no row names "Paperclip · Acme"; with a second source connected, each chat's row names its own.
