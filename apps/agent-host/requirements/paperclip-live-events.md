# agent-host.paperclip-live-events

- Status: active
- Since: unreleased
- Source: the sync service design approved by the maintainer on HAL-19201, with the maintainer's conditions; HAL-19125 (new messages 20+ s late); task HAL-19339 (PR 7 of that build), with the security follow-ups from the PR 6 gate (HAL-19381)

While a Paperclip connection is connected, the agent host shall keep its live events socket open. When the socket drops, the agent host shall open a new one after a wait drawn at random between 0 and a cap of 1 second, doubled on each attempt up to 60 seconds, and start from 1 second again once a socket stayed open 5 minutes. When Paperclip refuses the socket (403) or the key (401), the agent host shall not open it again until a new key is handed over, and shall count events as `not-allowed`. When an event says a task, card, approval, other board request or agent changed, the agent host shall read the connection's local copy again 300 milliseconds after the first such event, with one read for all events in that time; an event that changes nothing the local copy keeps, such as a run's once-a-second activity or its logs, shall bring no read. On `live.resync` the agent host shall read within 300 milliseconds, with one read for every resync and event in that time, and whenever the socket opens it shall read at once. When the connection is disconnected, the agent host shall close its socket and not open it again. Events shall count as connected only while every connection's socket is open; otherwise the engine shall poll at the rates without events (`agent-host.paperclip-polling`). Each change a read applies shall be counted as `event` when an event announced it, `catch-up` after a resync or an open, and otherwise `poll`, which counts as missed by events while they were connected (`agent-host.sync-diagnostics`). The agent host shall pass on only that an event touched the local copy, never what the event said: the changed records are read again over the normal HTTP routes.

## Examples

- Given a connection whose socket is open,
  when Paperclip sends an event for a new comment,
  then within 2 seconds the chat's new state is in the local copy, the new message reads, and the change counts as `event`.
- Given an open socket,
  when ten events arrive within 300 milliseconds,
  then the agent host reads the local copy once.
- Given an open socket,
  when Paperclip sends `heartbeat.run.activity`,
  then the agent host reads nothing.
- Given a socket Paperclip refuses with 403,
  when an hour passes,
  then the agent host never opens it again, counts events as `not-allowed`, and polls every 10 seconds while a window is open.
- Given an open socket,
  when Paperclip sends `live.resync` five times within 300 milliseconds,
  then the agent host reads the local copy once.
- Given a connection whose socket is open,
  when the person disconnects it,
  then its socket closes and no new one opens.
- Given a socket that dropped 3 times, then stayed open 4 minutes 59 seconds,
  when it drops again,
  then the next attempt comes at most 8 seconds later.
- Given a socket that dropped 8 times in a row,
  when it drops again,
  then the next attempt comes at most 60 seconds later.
- Given a socket that stayed open 5 minutes,
  when it drops,
  then the next attempt comes at most 1 second later.
