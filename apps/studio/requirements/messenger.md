# studio.messenger

- Status: draft
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov), with the board's direction of 24 Nov 10:18 and 10:20 UTC (apps talk only to the engine; desktop and server engines); ADR `docs/adr/2026-11-24-agent-messaging.md` (features 5 and 7, and the HAL-17421 renders); Julian's security review HAL-17436 (finding 3). Draft until track C creates the Messenger feature; it then moves into that feature and becomes active.

The Messenger shall show one conversation per agent from `AgentMessaging`, newest first, with the tabs "All" and "Waiting for me", each under its source's label, and shall send a message through `AgentMessaging.send`. It shall render messages with no raw HTML, scripts or `javascript:` links, open links outside the app, load no image on its own, and never treat a message as a Halonic command.

## Examples

- Given the board's chat with Chief on the Paperclip source,
  when the board sends "Morning" in Chief's conversation,
  then the message is sent through `AgentMessaging.send` and shows in the conversation.
- Given two sources that each have an agent named Chief,
  when the Messenger is opened,
  then it shows two conversations, each under its source's label.
