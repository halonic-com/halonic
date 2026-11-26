# messenger.chat-rows

- Status: active
- Since: unreleased
- Source: design review HAL-18481 (improvement 4), approved by the board on HAL-10 (25 Nov, 13:28 UTC); HAL-18556; the Messenger look and layout changes approved by the board on HAL-10 (26 Nov, 03:51 UTC) and HAL-19132, Sofia's sketches on HAL-19134; built on HAL-19141; the count follows the read mark since HAL-19492 (Mark as read and Mark as unread, approved by the board on HAL-19192).

The Messenger shall show, in each row of its list, under the conversation's name, the first line of its newest message, with "You: " first when the person wrote it, and the newest message's time on the right. While the chat agent has open cards, or a channel holds a question for the person, the row shall show a 6px violet dot after the name, read out as "needs you", and no card label. The row shall show a count of the agent's messages since the person's own newest message that came after the chat's read mark (`messenger.read-marks`), read out as "2 unread", written "99+" past 99; it shall show no count while the conversation is open. A chat's row shall name its source only while the list holds conversations from more than one source.

## Examples

- Given Chief's chat, whose newest message "Shall I merge #12?" came at 9:30,
  when the board opens the Messenger,
  then Chief's row says "Shall I merge #12?" and "09:30", with "1 unread".
- Given the same chat,
  when the board opens it, then opens Liam's chat,
  then Chief's row has no count.
- Given Chief has two open cards,
  when the board opens the Messenger,
  then Chief's row shows the violet dot after "Chief", and no "2 cards".
- Given one source,
  when the board opens the Messenger,
  then no row names "Paperclip · Acme"; with a second source connected, each chat's row names its own.
