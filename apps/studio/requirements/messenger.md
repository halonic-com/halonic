# studio.messenger

- Status: draft
- Since: unreleased
- Source: HAL-17422 plan (features 5, 6 and 7, and the HAL-17421 renders), approved by the board on HAL-10 (24 Nov); ADR `docs/adr/2026-11-24-paperclip-connection.md`. Draft until track C creates the Messenger feature; it then moves into that feature and becomes active.

The Messenger shall show one conversation per Paperclip agent, mapped to the task whose `chatWith` names that agent, newest first, with the tabs "All" and "Waiting for me", and shall send a message as a comment on that task through the `PaperclipSource` of the agent's connection.

## Examples

- Given the board's chat with Chief is the task HAL-10,
  when the board sends "Morning" in Chief's conversation,
  then it appears as a comment on HAL-10.
- Given two connections that each have an agent named Chief,
  when the Messenger is opened,
  then it shows two conversations, each under its connection's name.
