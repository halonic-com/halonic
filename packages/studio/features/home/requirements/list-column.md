# home.list-column

- Status: active
- Since: unreleased
- Source: HAL-20741; HAL-20617 build plan, phase P5; HAL-20673 rail flows, section 2, lines 20, 21 and 29

Home's list column shall show "New chat" first, then the folder's AI chats, the newest message first, and no agent chat. While the folder has no AI chats, it shall say "No chats yet." under "New chat". When the person presses "New chat", Home shall start a new chat and open it in the content pane; if it can't start, Home shall say "Couldn't start a chat." with the reason. When the person picks a chat, Home shall open it in the content pane and show its row as the current one. While the Assistant isn't there, the list column shall be empty and the content pane shall show Home's sections.

## Examples

- Given the AI chats "Triage" (20 Nov) and "Digest" (26 Nov),
  when Home is shown,
  then its list column reads New chat, Digest, Triage.
- Given no AI chats,
  when Home is shown,
  then its list column reads New chat, No chats yet.
- Given Home is shown,
  when the person presses New chat,
  then the new chat opens in the content pane.
