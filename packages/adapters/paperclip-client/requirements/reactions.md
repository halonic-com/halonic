# paperclip-client.reactions

- Status: active
- Since: unreleased
- Source: HAL-19139 (the board's yes on the reactions card, 26 Nov 12:21 UTC); build plan approved by Liam on HAL-19139, PR 2a

The Paperclip provider shall give a chat's or channel's message reactions from the agent-tools plugin's `GET /api/plugins/halonic.agent-tools/api/reactions/{task}` route, each with its emoji, its time and its author named as messages are (the person as `me`, an agent by its name), and shall add or remove the person's own reaction with `POST` on the same route sending exactly `{ commentId, emoji, on }` with `on` a boolean. A 404 on the list shall read as `not-supported`, so a server without the plugin shows chats without reactions; offline and signed-out shall be refusals with those reasons; an ID that isn't this connection's chat, channel or message shall be refused as `not-found` before any request.

## Examples

- Given the plugin lists 👍 by the person and 👀 by Ada on comment `m1`, when Studio lists the chat's reactions, then message `m1` has 👍 by `me` and 👀 by Ada.
- Given a server without the plugin, when Studio lists a chat's reactions, then the answer is refused with `not-supported`.
- Given the person adds ❤️ to `m1`, then the provider posts `{ commentId: "m1", emoji: "❤️", on: true }` and answers the message's reactions after it.
