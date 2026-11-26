# studio.src-tauri.quick-ask-chat

- Status: draft
- Since: unreleased
- Source: HAL-18961, plan on HAL-18625; design HAL-18594 (section 5, "Handing over to Messenger", approved by the board on 25 Nov); the box's buttons in `studio.quick-ask.*`

When quick ask's box calls `plugin:quick-ask|open_chat` with a chat's ID as `conversation`, the shell shall show Messenger's window on that chat and then hide the box. When Messenger's window is open, the shell shall bring it forward and send it `notification-clicked` with `{ messagingId, kind: "conversation" }`, as for a click on that chat's notification. When it is closed, the shell shall keep the chat, in place of any chat kept before, open Messenger's window, and send no event; the command `plugin:quick-ask|take_chat` shall then return the kept `{ messagingId, kind: "conversation" }` once and clear it, so that a later call returns nothing. If Messenger's window doesn't open, the shell shall keep no chat, leave the box showing and refuse as `failed`. The shell shall refuse `open_chat` as `not_the_box` from any window but the box, and as `invalid` for an empty ID or one longer than 512 characters, and `take_chat` as `not_messenger` from any window but Messenger's. The served Studio shall get neither command.

## Examples

- Given Messenger's window closed and the box showing,
  when the box calls `open_chat` with `{ "conversation": "chat-acme-chief" }`,
  then Messenger's window opens, the box hides,
  and `take_chat` from Messenger's window returns `{ "messagingId": "chat-acme-chief", "kind": "conversation" }`, then `null`.
- Given Messenger's window open,
  when the box calls `open_chat` with `{ "conversation": "chat-acme-chief" }`,
  then Messenger's window comes forward and gets `notification-clicked` with `{ "messagingId": "chat-acme-chief", "kind": "conversation" }`.
- Given Studio's window,
  when it calls `open_chat`,
  then it is refused as `not_the_box`, and no window opens.
