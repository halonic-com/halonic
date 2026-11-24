# agent-host.agent-messaging-offline

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov), with the board's direction of 24 Nov 10:18 and 10:20 UTC (apps talk only to the engine; desktop and server engines); ADR `docs/adr/2026-11-24-agent-messaging.md`. Was `ports.agent-messaging-offline` while a draft; moved here with the desktop engine that serves `AgentMessaging` with its cache (HAL-17438). The engine's cache is `agent-host.agent-messaging-cache`; the banner, the answer buttons and drafts are the Inbox's and Messenger's (`inbox.agent-inbox-items`, `messenger.conversations`).

While a source can't be reached, Studio shall show its cached items with a banner "Offline, as of" and the time of the last live read, shall turn the answer buttons off, and shall keep a typed message as a draft; it shall never queue an answer or a message to send later. The engine's cache shall live in the app data folder, outside every workspace, in files only the user can read, and shall hold items only: never a key, a cookie or session, an `Authorization` header, or a whole request or response.

## Examples

- Given cards last read at 14:02 and a source that stops answering,
  when the Inbox is opened,
  then it shows the cards with "Offline, as of 14:02" and the answer buttons are off.
- Given an offline source and a typed message,
  when the line comes back,
  then the message is still a draft and was not sent.
- Given a workspace in git,
  when the engine caches a source's items,
  then no file inside the workspace changes and no cache file holds the key.
