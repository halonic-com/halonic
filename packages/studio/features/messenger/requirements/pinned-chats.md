# messenger.pinned-chats

- Status: active
- Since: unreleased
- Source: Sofia's flows on HAL-20673 (lines 20 to 23: pinned chats first, up to 3, the most recently pinned first, "You can pin up to 3 chats.", Sofia's recommended option A); Messenger's list column takes pinned and recent chats, Chief on HAL-20730 (28 Nov, 11:46 CET)

The open chat's ··· menu shall offer **Pin chat**, or **Unpin chat** while the chat is pinned. While at least one chat is pinned and no search is open, the Messenger shall list the pinned chats first, under "Pinned", the most recently pinned first, then the other chats, newest message first. The Messenger shall keep at most 3 pinned chats on this device, so they outlive a restart; only pins whose chats the list holds shall count, and a new pin shall take the place of a pin whose chat the list no longer holds (a channel the person left, say). Each pin or unpin shall leave the pins another Studio window kept in the meantime as they are. If the person pins a fourth chat, then the Messenger shall keep the three, read out "You can pin up to 3 chats." on every such try, and show it under the list's header until the next pin or unpin. While a search is open, the Messenger shall list what it found in its own order, with no "Pinned" group.

## Examples

- Given Chief's and Mara's chats, Mara's with the newest message,
  when the board opens Chief's chat and picks **Pin chat** in its ··· menu,
  then Chief's row shows first, under "Pinned", and Mara's row follows it.
- Given three pinned chats,
  when the board picks **Pin chat** for a fourth,
  then the three stay pinned, the fourth isn't, and "You can pin up to 3 chats." shows under the list's header.
- Given Chief's chat pinned,
  when the board picks **Unpin chat** in its ··· menu,
  then "Pinned" goes and Chief's row takes its place by its newest message.
- Given a pinned channel and two pinned chats,
  when the board leaves the channel and pins a third chat,
  then the third chat is pinned and nothing says the pins are full.
