# agent-host.agent-messaging-cache

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov); ADR `docs/adr/2026-11-24-agent-messaging.md` (data and offline); the engine's half of `ports.agent-messaging-offline`; task HAL-17494

When the agent host reads a source's agents, conversations, messages, inbox items or work through `AgentMessaging` while the source is online, it shall keep the port's fields of what the read returned in a cache folder in the app data folder, refusing a folder inside any workspace, in files only the user can read, and shall keep nothing else: never a key, a cookie or session, an `Authorization` header, or a whole request or response. While the source is offline, the agent host shall answer reads and searches of it from that cache and report the source offline as of its last cached live read. It shall send an answer or a message straight to the source, which sends it or refuses it, and shall never keep one to send later. Clearing a source shall delete everything cached for it, the source's local copy (`agent-host.paperclip-sync`) included.

## Examples

- Given an inbox card read live at 14:02 and a source that stops answering at 15:30,
  when the Inbox reads again,
  then it gets the card, and the source is offline as of 14:02.
- Given an offline source,
  when the person answers a card or sends a message,
  then it is refused with `offline`, and when the line comes back the card is still open and the message was not sent.
- Given a provider that hangs its request, with its key in an `Authorization` header, on every item,
  when the agent host caches the items,
  then no cache file holds the key, the header or the request.
- Given a workspace folder,
  when the agent host caches a source's items,
  then no file inside the workspace changes, and a cache folder inside it is refused.
- Given two cached sources,
  when one is cleared,
  then its files are gone and the other's remain.
- Given a Paperclip source with a local copy,
  when it is cleared,
  then the local copy's files are gone too.
