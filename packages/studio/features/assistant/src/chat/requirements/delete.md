# assistant.chat.delete

- Status: active
- Since: unreleased
- Source: HAL-16801 (T14 PR 10); req-assistant (HAL-110); flow-assistant 5.6 (HAL-647); states H3 (HAL-5896); microcopy 14.1 (HAL-751); AI changes 1.9 (HAL-3228)

When the person picks ⋮ › **Delete chat…** in the panel, the panel shall ask with a small dialog titled 'Delete the chat "*title*"?', with **Cancel** and **Delete chat**. When the chat left changes to review in items, the dialog shall say "The changes it made in *2* items stay there to review."; those changes stay in the items. Confirmed, the chat shall be removed from the kept chats and the panel shall show no chat: "No chat open", its line and **New chat**, with focus on New chat. Cancel shall change nothing. A draft has no ⋮.

## Examples

- Given the chat "Daily routine" with changes to review in 2 items, when the person picks Delete chat…,
  then the dialog says 'Delete the chat "Daily routine"?' and "The changes it made in 2 items stay there to review.".
- Given that dialog, when the person clicks Delete chat,
  then the chat is deleted and the panel shows "No chat open" with focus on New chat.
- Given that dialog, when the person clicks Cancel, then the chat is still shown and kept.
