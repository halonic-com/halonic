# agent-host.message-reactions-routes

- Status: active
- Since: unreleased
- Source: HAL-19139 (the board's yes on the reactions card, 26 Nov 12:21 UTC); build plan approved by Liam on HAL-19139, PR 2a

The agent host shall serve one workspace's message reactions with `POST /v1/messaging/reactions` (`{ conversation }`) and `POST /v1/messaging/react` (`{ message, emoji, on }`, the emoji one of 👍 ❤️ 😂 😮 ✅ 👀 and `on` a boolean, any other field refused), each answering `{ result }` from the connected Paperclip connection that the conversation's or message's ID belongs to, sent with that connection's key guard. With no such connection, or while the workspace's messaging engine is a server, the result shall be `not-supported`.

## Examples

- Given a connected Paperclip whose agent-tools plugin lists 👍 by the person on comment `c1` of task-1, when Studio lists the chat's reactions, then the result has 👍 by `me` on that message.
- Given a Paperclip without the plugin, when Studio lists a chat's reactions, then the result is `not-supported`.
- Given an emoji outside the six, when Studio posts a reaction, then the host refuses the body.
