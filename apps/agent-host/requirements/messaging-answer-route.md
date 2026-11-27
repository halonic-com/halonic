# agent-host.messaging-answer-route

- Status: active
- Since: unreleased
- Source: HAL-19350 (board report on HAL-10, 26 Nov: Submit on a card in Messenger and the Inbox sent nothing)

When Studio sends `POST /v1/messaging/answer`, the agent host shall pass on to the workspace's `AgentMessaging` every answer the port takes to an item the workspace lists, except an approve of a risky item, which waits for the person's yes in Studio's shell (`agent-host.risky-answer-confirm`), as the server engine reads it: an option with or without a note, a reply, the `answers` to a card's questions, and an `action-result` that passes the port's check. It shall answer an answer of any other shape with the result `refused`, reason `bad-answer`, without asking any source.

## Examples

- Given a card that asks several questions,
  when the person picks an option for each and presses Submit,
  then the `answers` reach the workspace's messaging unchanged and Studio gets its result.
- Given an answer with an unknown `kind`,
  when Studio sends it,
  then the result is `refused` with `bad-answer` and no source is asked.
