# messenger.open-from-quick-ask

- Status: active
- Since: unreleased
- Source: HAL-19097, after HAL-19089 (`quick-ask.messenger`); design HAL-18594 (section 5, "Handing over to Messenger"); the shell's side in `studio.src-tauri.quick-ask-open-chat`

When quick ask's box hands a chat over to Messenger, by its Open in Messenger, Answer in Messenger or Last answer ›, the Messenger's window shall open that chat in place of the one it showed, at its newest message, with the focus in its box. The chat that opened Messenger's window shall open once its page starts, taken from the shell through `plugin:quick-ask|take_chat` once; a chat handed over while the window is open shall come as the shell's `open-conversation` event to Messenger's window. In a window narrower than 900px, the chat shall show in place of the list. Messenger shall do nothing else with a hand-over: it never sends or answers anything.

## Examples

- Given Halonic Messenger closed,
  when the person presses Open in Messenger under Liam's answer in the box,
  then Messenger's window opens on the chat with Liam, at its newest message, with the focus in its box.
- Given Messenger's window open on the chat with Liam,
  when the box hands over the chat with Chief,
  then the Messenger shows the chat with Chief, with the focus in its box.
