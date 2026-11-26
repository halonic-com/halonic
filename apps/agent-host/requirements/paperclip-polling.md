# agent-host.paperclip-polling

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov), with the board's direction of 24 Nov 10:18 and 10:20 UTC (apps talk only to the engine; desktop and server engines); ADR `docs/adr/2026-11-24-agent-messaging.md`. Was `ports.paperclip-polling` while a draft; moved here with the code that does it (HAL-17493). The 5-second reads while a chat waits for its agent: HAL-19388, after the board reported on HAL-10 that the typing line didn't show (HAL-19362).

While Studio's window is in front, the engine shall read each Paperclip connection about every 30 seconds; while it is in the background, about every 5 minutes; and when the window comes back to the front, the engine shall read at once. While the window is in front and a conversation the person sent to in the last 3 minutes waits for its agent (the conversation's agent is working on it, or hasn't answered since the person's message), the engine shall read about every 5 seconds instead, with one extra read of the conversation list and none of a conversation's messages, and about every 30 seconds again once none waits or 3 minutes after the last send. Timers shall go through the `Scheduler` port, and a read that finds changes shall report the source on `AgentMessaging.changes`.

## Examples

- Given a window in front,
  when 30 seconds pass,
  then the engine reads the connection once.
- Given a window in the background for 2 minutes,
  when it comes back to the front,
  then the engine reads the connection at once.
- Given a Paperclip connection that serves team status and a window in front,
  when 30 seconds pass,
  then the engine reads the connection's messaging once and not its team status, which it reads on the 5-minute tick.
- Given a window in front and a message the person just sent that the agent hasn't answered,
  when 5 seconds pass,
  then the engine reads the connection once.
- Given a window in front and a message the person sent 3 minutes ago that the agent still hasn't answered,
  when 5 seconds pass,
  then the engine doesn't read the connection; it reads it 30 seconds after the last read.
