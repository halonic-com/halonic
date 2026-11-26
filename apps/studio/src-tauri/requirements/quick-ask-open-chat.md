# studio.src-tauri.quick-ask-open-chat

- Status: draft
- Since: unreleased
- Source: HAL-19097, after HAL-19089 (`quick-ask.messenger`); design HAL-18594 (section 5, "Handing over to Messenger")

When quick ask's box calls `plugin:quick-ask|open_chat` with `{ conversation }`, the shell shall check the conversation ID only as an opaque string, refusing an empty one or one longer than 512 bytes as `invalid`, then hide the box and show Messenger's window. When Messenger's window was open, the shell shall bring it forward and send it `open-conversation` with `{ conversation }`. When it was closed, the shell shall open it and keep the chat, in place of any chat kept before, instead of sending the event, and `plugin:quick-ask|take_chat` shall return the kept `{ conversation }` once and clear it, so that a later call returns nothing; a window that didn't open shall leave nothing kept. Only the `ask` window shall get `plugin:quick-ask|open_chat`, refused as `not_the_box` from any other, and only Messenger's window shall get `plugin:quick-ask|take_chat`, refused as `not_messenger` from any other. The served Studio shall get neither.

## Examples

- Given the box and Messenger's window open,
  when the box calls `plugin:quick-ask|open_chat` with `{ "conversation": "chat-acme-chief" }`,
  then the box hides, and Messenger's window comes forward and gets `open-conversation` with `{ "conversation": "chat-acme-chief" }`.
- Given Messenger's window closed,
  when the box opens a chat with Chief,
  then Messenger's window opens with no event, and `plugin:quick-ask|take_chat` returns `{ "conversation": "chat-acme-chief" }`, then `null`.
- Given Studio's window,
  when it calls `plugin:quick-ask|open_chat`,
  then it is refused as `not_the_box` and nothing opens.
- Given the box,
  when it calls `plugin:quick-ask|open_chat` with an empty conversation,
  then it is refused as `invalid` and nothing opens.
