# agent-host.paperclip-polling

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov), with the board's direction of 24 Nov 10:18 and 10:20 UTC (apps talk only to the engine; desktop and server engines); ADR `docs/adr/2026-11-24-agent-messaging.md`. Was `ports.paperclip-polling` while a draft; moved here with the code that does it (HAL-17493). The 5-second reads while a chat waits for its agent: HAL-19388, after the board reported on HAL-10 that the typing line didn't show (HAL-19362). The rates by window and live events, the first full load and the catch-up: the sync service design (HAL-19201, approved by Liam), built on HAL-19336.

When the agent host starts, the engine shall read each Paperclip connection at once, as its first full load. While the agent host runs, the engine shall then read it on the rates of one table, by whether a window is open and whether the connection's live events reach it: with events, about every minute while a window is open and every 5 minutes while none is; without events, or before they connect, about every 10 seconds while a window is open and every 2 minutes while none is. When a window comes to the front, or live events (re)connect, the engine shall read at once. While a window is open and a conversation the person sent to in the last 3 minutes waits for its agent (the conversation's agent is working on it, or hasn't answered since the person's message), the engine shall read about every 5 seconds instead, with one extra read of the conversation list and none of a conversation's messages, and on the table's rate again once none waits or 3 minutes after the last send. The engine's timers shall go through the `Scheduler` port, a read that changes the local copy shall report the source on `AgentMessaging.changes`, and a read that changes nothing shall report nothing.

## Examples

- Given an agent host that just started,
  when no time has passed,
  then the engine reads the connection once.
- Given a window open and no live events,
  when 10 seconds pass,
  then the engine reads the connection once.
- Given no window open and no live events,
  when the engine has just read the connection,
  then its next read is due 2 minutes later.
- Given live events connected and a window open,
  when the engine has just read the connection,
  then its next read is due 1 minute later.
- Given a window in the background for 2 minutes,
  when it comes back to the front,
  then the engine reads the connection at once.
- Given live events that were down,
  when they connect,
  then the engine reads the connection at once.
- Given a Paperclip connection that serves team status and a window open,
  when 10 seconds pass,
  then the engine reads the connection's messaging once and not its team status, which it reads on the 5-minute tick.
- Given a window open and a message the person just sent that the agent hasn't answered,
  when 5 seconds pass,
  then the engine reads the connection once.
- Given a window open and a message the person sent 3 minutes ago that the agent still hasn't answered,
  when the engine reads the connection,
  then its next read is due 10 seconds later.
- Given a read that finds nothing changed,
  when it ends,
  then nothing is reported on `AgentMessaging.changes`.
