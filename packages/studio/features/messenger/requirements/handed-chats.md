# messenger.handed-chats

- Status: draft
- Since: unreleased
- Source: HAL-18961, plan on HAL-18625; design HAL-18594 (section 5, "Handing over to Messenger"); the shell's side in `studio.src-tauri.quick-ask-chat` and `services.chat-clicks`

When Messenger's window starts on a chat the desktop shell handed it, such as one quick ask's **Open in Messenger**, **Answer in Messenger** or **Last answer ›** opened the window on, the Messenger shall open that chat. When the shell hands the open window a chat later, the Messenger shall open that chat in place of the open one. When the page closes, the Messenger shall stop hearing the shell's chats.

## Examples

- Given Messenger's window closed,
  when the person presses **Open in Messenger** on Chief's answer in quick ask's box,
  then Messenger's window opens on the chat with Chief.
- Given Messenger's window open on the chat with Liam,
  when the shell hands it the chat with Chief,
  then the chat with Chief opens.
