# services.chat-clicks

- Status: draft
- Since: unreleased
- Source: HAL-18961, plan on HAL-18625; design HAL-18594 (section 5, "Handing over to Messenger"); the shell's side in `studio.src-tauri.quick-ask-chat`

When Messenger's window asks for the chat that opened it, the Studio shall take it from the shell's `plugin:quick-ask|take_chat` once, and answer every later ask with that same chat, or with none when the shell kept none or refused. When the shell sends Messenger's window `notification-clicked` for a `conversation` with a non-empty `messagingId`, the Studio shall hand that chat to Messenger, and it shall hand over no click of any other kind. If the shell refuses the take or the listen, the Studio shall report it and open nothing.

## Examples

- Given the shell kept `{ "messagingId": "chat-acme-chief", "kind": "conversation" }`,
  when Messenger's window asks twice,
  then both asks answer `chat-acme-chief`, and the shell is asked once.
- Given Messenger's window listening,
  when the shell sends a click on a `run`,
  then Messenger opens nothing.
