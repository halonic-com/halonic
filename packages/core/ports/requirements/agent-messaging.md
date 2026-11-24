# ports.agent-messaging

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov), with the board's direction of 24 Nov 10:18 and 10:20 UTC (apps talk only to the engine; desktop and server engines); ADR `docs/adr/2026-11-24-agent-messaging.md`; task HAL-17425

The ports package shall have an `AgentMessaging` port through which Studio's apps list sources, agents, conversations, messages, inbox items and work, search, answer an inbox item, send a message and hear which source changed, where every ID is opaque to apps, every item names its source, an inbox item names its project when it has one (the board's requirement of 24 Nov 11:05 UTC, so the Inbox can filter by project), a source says whether it is online, offline as of a time, or signed out, and a write is either sent at once or refused with `offline`, `signed-out` or `not-found`, never queued.

The port's documentation shall state that apps see no provider's types, IDs or addresses, that the port is the same whether the engine runs on the desktop or on a server, and that message bodies and questions are agent-written Markdown that apps render without raw HTML, scripts or `javascript:` links.

## Examples

- Given the `AgentMessaging` port,
  when its members are read,
  then they are exactly the list, search, `answer`, `send` and `changes` calls, and none names a provider.
- Given a `MessagingSource` whose state is offline without a time,
  when it is compiled,
  then it doesn't compile.
- Given a `SendResult` with the outcome `queued`,
  when it is compiled,
  then it doesn't compile.
