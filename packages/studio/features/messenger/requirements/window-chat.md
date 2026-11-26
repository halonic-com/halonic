# messenger.window-chat

- Status: draft
- Since: unreleased
- Source: HAL-19734 (part D of HAL-19534's plan, approved on HAL-19566); the window's content in `studio.window-content`

The Messenger shall tell its watchers which chat its page shows, by id, each time that changes. When its window reopens on a kept chat, the Messenger shall read its chats list and ask the page to open that chat only while it is in the list; the page shall open it at once, or as soon as it shows. A chat that is gone shall leave the chats list showing, with no chat open.

## Examples

- Given the Messenger's window showed the chat with Ada at the last quit,
  when Halonic starts again,
  then the Messenger's window opens on the chat with Ada.
- Given the Messenger's window showed a chat that was deleted since,
  when Halonic starts again,
  then the Messenger's window shows the chats list, with no chat open.
