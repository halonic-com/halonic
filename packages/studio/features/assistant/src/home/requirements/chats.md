# assistant.home.chats

- Status: active
- Since: unreleased
- Source: HAL-20741; HAL-20673 rail flows, section 2, lines 20 and 21

The Assistant shall give the Home feature the workspace's AI chats through `AiChatsService`: the Build chats with a message, the newest message first, and no agent chat, since an agent's conversation shows only in Messenger. It shall tell Home after each change to the list of chats. Home shall be a place of its own, apart from the side panel and the tabs, and a chat shall be in one place at a time. While Home holds a chat, the side panel and the tabs shall not show it, and Ctrl+Alt+I shall open another chat. When Home gives the chat back, it shall be an ordinary panel chat again. When the held chat is deleted, or shown in the panel (the chat menu, Go to it) or a tab, the Assistant shall tell Home that it left. Home's pane shall show the chat with its title, which renames it, and ⋮ with Delete chat…, without Continue in the side panel or the items panel. A Ctrl-click, Cmd-click or middle click in Home shall open the chat as its tab, next to the active one.

## Examples

- Given the Build chats "Triage" (last message 20 Nov) and "Digest" (26 Nov), an agent chat with Ada, and an empty draft,
  when Home lists the chats,
  then it gets Digest, Triage.
- Given the side panel shows "Triage",
  when Home opens "Triage",
  then the panel no longer shows it.
- Given Home opened "Triage",
  when Home moves on to its sections,
  then the panel's chat menu shows "Triage" in the panel again.
- Given Home holds "Triage",
  when the person picks "Triage" in the panel's chat menu,
  then the panel shows it and Home hears that it left.
- Given Home holds "Triage",
  when it is deleted,
  then Home hears that it left.
