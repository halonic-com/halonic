# agent-host-client.message-reactions

- Status: active
- Since: unreleased
- Source: HAL-19139 (the board's yes on the reactions card, 26 Nov 12:21 UTC); Liam's plan review on HAL-19139: a host and a client of different versions degrade to "no reactions" and never fail the chat

The desktop engine's `MessageReactions` client shall list a conversation's reactions with `POST /v1/messaging/reactions` and add or remove the person's own with `POST /v1/messaging/react`, sending the workspace with each, and pass on the host's result. When the host answers 404 `not_found` because it doesn't serve the route, the client shall answer `not-supported` instead of failing; any other refusal from the host shall fail with the host's kind.

## Examples

- Given a host older than reactions, when Studio lists a chat's reactions, then the answer is `{ outcome: "refused", reason: "not-supported" }` and the chat still shows.
- Given the host answers 404 `unknown_workspace`, when Studio lists a chat's reactions, then the call fails with that kind.
