# messenger.window-chat

- Status: active
- Since: unreleased
- Source: HAL-19734 (part D of HAL-19534's plan, approved on HAL-19566); the window's content in `studio.window-content`

The Messenger shall tell its watchers which chat its page shows, by id, each time that changes. When its window reopens on a kept chat, the Messenger shall read its chats list and ask the page to open that chat only while it is in the list; the page shall open it at once, or as soon as it shows. Once the page has opened a chat itself since it started, one a chat quick ask's box handed over or a row the person picked, it shall keep that chat open and drop the kept one. A chat that is gone shall leave the chats list showing, with no chat open.

## Examples

- Given the Messenger's window showed the chat with Ada at the last quit,
  when Halonic starts again,
  then the Messenger's window opens on the chat with Ada.
- Given the Messenger's window showed a chat that was deleted since,
  when Halonic starts again,
  then the Messenger's window shows the chats list, with no chat open.
- Given the Messenger's window showed the chat with Chief at the last quit,
  when the person presses **Open in Messenger** under Liam's answer in a chat quick ask's box,
  then the Messenger's window opens on the chat with Liam, with the focus in its box.
