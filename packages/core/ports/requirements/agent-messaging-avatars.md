# ports.agent-messaging-avatars

- Status: active
- Since: unreleased
- Source: the board's ask on HAL-18473 (HAL-10, 25 Nov 12:07 UTC): each agent's picture in the Messenger, its initial as the fallback; plan HAL-18485, approved with amendments by Liam (25 Nov); ADR `docs/adr/2026-11-24-agent-messaging.md` ("Attachments")

The `AgentMessaging` port shall give an agent's picture as an optional opaque ID on the agent, never an address, and shall give its bytes only through the attachment read that the engine serves. The Paperclip provider shall give an agent a picture only when Paperclip names one by a path under `/api/agent-avatars/` on the connection's own host, shall read it with the connection's key on that host only, following no redirect, and shall take only a PNG, JPEG or WebP picture of at most 256 KB, checked on the answer's stated length and again on the bytes read. The agent host shall read a picture only from the provider that listed the agent.

## Examples

- Given a Paperclip agent whose `avatarUrl` is `/api/agent-avatars/ada.png`,
  when the agents are listed,
  then the agent carries a picture ID that holds no address, and reading it gives the PNG's bytes.
- Given a Paperclip agent whose `avatarUrl` is `https://elsewhere.example/ada.png`,
  when the agents are listed,
  then the agent has no picture, and nothing is ever read from that host.
- Given a picture Paperclip answers as `image/svg+xml`, or larger than 256 KB,
  when an app reads it,
  then the read is `refused` with `unsupported-type` or `too-large`.
- Given an attachment's ID,
  when an app reads it as a picture, or a picture's ID as an attachment,
  then neither reads as the other.
