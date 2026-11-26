# studio-click-test.paperclip-steps

- Status: active
- Since: unreleased
- Source: HAL-18354 (PR B of HAL-18317; the board's phase 1 list on HAL-17897); HAL-19449

The click test shall seed the throwaway Paperclip with a company, an agent, a task, a board card on that task and a chat with the agent, and after Connect Paperclip and the Connections steps, before the Studio basics and Settings steps, shall check, in order, each on the open workspace, each through Studio's windows and then through the test Paperclip's API:

8. **Inbox:** the Inbox shows the seeded card, under none of the lines that say the Inbox is showing an old list ("Showing what it said last.", "Showing what was read last.", "Couldn't load the items from your agents."), Approve answers it, the card leaves Needs you ("Nothing is waiting for you."), and Paperclip has the card approved.
9. **Messenger:** in the Halonic Messenger window, a message sent in the seeded chat is a comment on that chat in Paperclip, and the seeded agent's chat row and the open chat's header each show its picture (Paperclip gives every agent one), not its initials.
10. **Search:** Ctrl+K and the seeded task's title find the task, and its result opens.
11. **Overview and recap:** Overview shows the recap and the blocked list.
12. **Start menu shortcuts:** with Halonic running, the Halonic Inbox shortcut opens a new window in the running app, showing Needs you empty after step 8's answer, and the Halonic Messenger shortcut shows a window with the seeded chat. The click test never closes the app's windows itself.
13. **Disconnect:** Settings › Connections › Disconnect, confirmed, says the key is revoked, and Paperclip refuses the key Studio signed in with.

Each of these steps needs step 3; when it didn't pass, they are skipped.

## Examples

- Given an Inbox that shows the seeded card under "Showing what was read last.",
  then step 8 fails as `STALE_INBOX`, with the screen's last words.
- Given an Approve click that never reached Paperclip,
  then step 8 fails as `NOT_ANSWERED_ON_PAPERCLIP`, with the status Paperclip shows.
- Given a message that never became a comment,
  then step 9 fails as `NOT_ON_PAPERCLIP`.
- Given a Messenger that shows the seeded agent's initials instead of its picture,
  then step 9 fails as `NO_AGENT_PICTURE`, naming the chat row, the header or both.
- Given a Studio with no Overview in Places,
  then step 11 fails as `NO_OVERVIEW`.
- Given a Disconnect after which the key still works,
  then step 13 fails as `KEY_NOT_REVOKED`.
