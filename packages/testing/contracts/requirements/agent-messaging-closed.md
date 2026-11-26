# contracts.agent-messaging-closed

- Status: active
- Since: unreleased
- Source: HAL-19496 (board report on HAL-10: a card cancelled or expired in Paperclip vanished from Messenger and Inbox without a reason); plan approved by Liam

The `AgentMessaging` contract shall pass for every `AgentMessaging`, whatever carries it, for an item that closed without an answer: the item shall list with the state `closed`, its reason (`cancelled` or `expired`), when it closed and, only when the source names one, who closed it, and an answer to it shall give the outcome `closed` with the same reason and time and shall answer nothing.

## Examples

- Given an item Ada cancelled elsewhere at 10:00, over the server's messaging routes,
  when the items are listed and the item is answered,
  then it lists as `closed`, `cancelled` at 10:00 by Ada, and the answer gives `closed`, `cancelled` at 10:00.
- Given an item whose time ran out at 10:00,
  when the items are listed,
  then it lists as `closed`, `expired` at 10:00, with no one named.
