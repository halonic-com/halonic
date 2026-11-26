# agent-host.sync-diagnostics

- Status: active
- Since: unreleased
- Source: the sync service design approved by the maintainer on HAL-19201, with the maintainer's conditions: the endpoint and logs carry counts and timings only (PR 5, HAL-19337)

The agent host shall count every change it applies to a connection's local copy by how it arrived (a live event, a poll, the catch-up read after a start or a reconnect, or a write the source accepted), the lag of polls and events from the source's time of the change, the changes a poll found while events were connected, the reconnects of events, the time spent connected, polling only and not allowed, and the time, size and failures of each Paperclip route by its template, over the last 24 hours in memory. `GET /v1/sync/diagnostics` shall answer these counts and timings with each source's share of the changes, and the agent host shall log one line of them on every change of connection and every 15 minutes. Neither the answer nor the lines shall hold a title, a body, an ID, an address, a query or a key.

## Examples

- Given three changes that arrived by poll and one by event, when Studio asks `GET /v1/sync/diagnostics`,
  then it answers a 75 % share for polls and 25 % for events.
- Given an Acme connection synced once and a message sent, when Studio asks `GET /v1/sync/diagnostics`,
  then the answer names routes such as `companies/:company/chats` and holds no task title, message body, ID or key.
- Given the agent host polled for 15 minutes, when the next poll ends,
  then the log has one line with the counts and timings only.
