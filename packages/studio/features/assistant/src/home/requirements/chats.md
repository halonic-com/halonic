# assistant.home.chats

- Status: active
- Since: unreleased
- Source: HAL-20741; HAL-20673 rail flows, section 2, lines 20 and 21

The Assistant shall give the Home feature the workspace's AI chats through `AiChatsService`: the Build chats with a message, the newest message first, and no agent chat, since an agent's conversation shows only in Messenger. It shall tell Home after each change to the chats. When Home starts a new chat or opens one, the Assistant shall take that chat out of the side panel, so one chat shows in one place at a time.

## Examples

- Given the Build chats "Triage" (last message 20 Nov) and "Digest" (26 Nov), an agent chat with Ada, and an empty draft,
  when Home lists the chats,
  then it gets Digest, Triage.
- Given the side panel shows "Triage",
  when Home opens "Triage",
  then the panel no longer shows it.
