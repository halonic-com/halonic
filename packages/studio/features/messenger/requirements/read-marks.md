# messenger.read-marks

- Status: active
- Since: unreleased
- Source: the read and unread rule approved by the board on HAL-19192 (26 Nov), Sofia's sketches D, F and H of 07:58 there; the plan approved by Liam on HAL-19492 (26 Nov, 09:12 UTC); built on HAL-19492

The Messenger shall keep on the device, for each chat, the time of the newest message the person read, so that a chat opened before Studio closed shows no count after it opens again. While a row that isn't open shows a count (`messenger.chat-rows`), hovering or focusing it shall show "Mark as read" in the time's place, which shall clear its count. While such a row shows no count and an agent's message is newer than the person's own, it shall show "Mark as unread", which shall give the row a count of its agent's newest message again. Each row's "Mark as read" and "Mark as unread" shall be named for a screen reader with the chat's name after the words, such as "Mark as read: Chief". The open chat's header shall end with a ··· button, named "More actions for" and the chat's name; while the open chat has such a message, its menu shall hold "Mark as unread", and choosing it shall mark the chat unread, close it and put focus on its row. When a source that is online lists chats but no longer lists one of them, the Messenger shall forget that chat's mark; a source that lists no chats in a read keeps every mark. Each change of a mark shall leave the marks another Studio window kept in the meantime as they are.

## Examples

- Given Chief's chat with "Shall I merge #12?", which the board opened,
  when Studio starts again,
  then Chief's row has no count.
- Given Chief's row with "1 unread",
  when the board hovers it and clicks "Mark as read",
  then the row has no count and a regular-weight name.
- Given Chief's row with "1 unread",
  then its action shows "Mark as read" and a screen reader hears "Mark as read: Chief".
- Given Chief's chat, read, whose newest message is Chief's,
  when the board hovers its row and clicks "Mark as unread",
  then the row shows "1 unread".
- Given Chief's chat open,
  when the board picks "Mark as unread" in the header's ··· menu,
  then the chat closes and focus is on Chief's row, which shows "1 unread".
