# assistant.chat.panel-shortcut

- Status: active
- Since: unreleased
- Source: HAL-16795 (T14 PR 6a); req-assistant (HAL-110); flow-assistant 2.1, 2.2 and 5.8 (HAL-647); UX checklist T14 1.1 and 1.2 (HAL-1361)

When the person presses Ctrl+Alt+I, or picks "Assistant" in Ctrl K, the Assistant feature shall show the window's Assistant panel when it is closed and hide it when it is open. The panel shall open on the chat it showed last in this session, else the workspace's most recently used chat, else a new Build chat, with focus in the box named "Message the assistant". When the person picks "New chat" in Ctrl K or the panel's **New chat**, the panel shall show a new Build chat, reusing an empty draft, open the panel if it is closed, and put focus in the box.

## Examples

- Given the panel is closed and chat "Add a routine" is the most recently used,
  when the person presses Ctrl+Alt+I,
  then the panel opens showing "Add a routine" with focus in the box.
- Given the workspace has no chats, when the panel opens, then it shows a new Build chat.
- Given the panel is open, when the person presses Ctrl+Alt+I, then it closes.
- Given the panel shows "Add a routine", when the person picks "New chat" in Ctrl K,
  then the panel shows a new Build chat.
