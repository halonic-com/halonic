# ports.agent-messaging-inbox-conversation

- Status: active
- Since: unreleased
- Source: HAL-18608 follow-up (b), HAL-18610: Open chat on Inbox cards (HAL-18557) opens the conversation the item was asked in; approved by Liam

The `AgentMessaging` port shall let an inbox item name the conversation it was asked in as an optional opaque ID, so an app opens that chat from the card without matching conversations itself; an item from no conversation shall carry none.

## Examples

- Given an inbox item an agent raised in conversation `acme:chat:1`,
  when the inbox items are listed,
  then the item's `conversation` is `acme:chat:1`.
- Given an inbox item raised outside any conversation,
  when the inbox items are listed,
  then the item has no `conversation`, and the app offers no Open chat for it.
