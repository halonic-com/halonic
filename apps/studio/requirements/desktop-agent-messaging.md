# studio.desktop-agent-messaging

- Status: active
- Since: unreleased
- Source: HAL-17897 (the board's check of phase 1's "Done when" in the built app, 24 Nov 22:29 UTC); ADR `docs/adr/2026-11-24-agent-messaging.md`

The desktop app shall register the Inbox, Messenger, Search and Overview features and give each folder opened with the agent host the engine's `AgentMessaging` for all of them, so the Messenger, search across sources, the overview and the daily recap read the same connected sources as the Inbox.

## Examples

- Given the desktop app's features,
  when the shell is created,
  then the Inbox, Messenger, Search and Overview features are registered.
- Given a desktop folder that is opened with the agent host,
  when its services are built,
  then it has the Messenger, Search, the overview and the daily recap.
