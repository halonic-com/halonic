# agent-host.paperclip-first-poll

- Status: active
- Since: unreleased
- Source: HAL-17897, the phase 1 check against a local Paperclip (25 Nov): after Connect, the new connection read as offline for about 30 seconds, until the next poll, so Settings showed it offline, the Inbox turned its answers off and the Messenger kept the first message as a draft.

When a Paperclip sign-in connects a source, the agent host shall read every connected source at once, and then again on the schedule of `agent-host.paperclip-polling`. Once polling has stopped, a sign-in shall start no read.

## Examples

- Given a window open, no live events and a poll due in 5 seconds,
  when a sign-in connects a source,
  then the engine reads the connections at once, and next 10 seconds after that read.
- Given a host whose polling has stopped,
  when a sign-in connects a source,
  then no read happens.
