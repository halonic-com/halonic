# agent-host.paperclip-polling

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov), with the board's direction of 24 Nov 10:18 and 10:20 UTC (apps talk only to the engine; desktop and server engines); ADR `docs/adr/2026-11-24-agent-messaging.md`. Was `ports.paperclip-polling` while a draft; moved here with the code that does it (HAL-17493).

While Studio's window is in front, the engine shall read each Paperclip connection about every 30 seconds; while it is in the background, about every 5 minutes; and when the window comes back to the front, the engine shall read at once. Timers shall go through the `Scheduler` port, and a read that finds changes shall report the source on `AgentMessaging.changes`.

## Examples

- Given a window in front,
  when 30 seconds pass,
  then the engine reads the connection once.
- Given a window in the background for 2 minutes,
  when it comes back to the front,
  then the engine reads the connection at once.
