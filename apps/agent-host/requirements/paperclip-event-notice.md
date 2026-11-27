# agent-host.paperclip-event-notice

- Status: active
- Since: unreleased
- Source: task HAL-20502 (the board found Messenger still late with live events on); HAL-19125 (new messages 20+ s late, target about 2 s)

When a batch of a connection's live events that touched its local copy ends (`agent-host.paperclip-live-events`), the agent host shall name the connection's source on Studio's changes before the read those events bring starts, so Studio reads an open chat's messages, which are read live from the source, without waiting for that read. When the read then changes the local copy, the agent host shall name the source again. A batch of only `live.resync` signals, a socket that opens, and a connection whose sockets are closed while its workspace's engine is a server shall name nothing early.

## Examples

- Given a connection whose socket is open and whose full read of the local copy takes 10 seconds,
  when Paperclip sends an event for a new comment on a chat,
  then within 2 seconds Studio's changes name the connection's source and the chat's messages read the new comment, while the full read still runs.
- Given an open socket,
  when ten events arrive within 300 milliseconds,
  then Studio's changes name the source once for them, 300 milliseconds after the first.
- Given an open socket,
  when Paperclip sends `live.resync`,
  then the source is named only once the read it brings changed the local copy.
