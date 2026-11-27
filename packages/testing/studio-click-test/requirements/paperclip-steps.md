# studio-click-test.paperclip-steps

- Status: active
- Since: unreleased
- Source: HAL-18354 (PR B of HAL-18317; the board's phase 1 list on HAL-17897); HAL-19449; HAL-19190

The click test shall seed the throwaway Paperclip with a company, an agent, a task, a board card on that task and a chat with the agent, and after Connect Paperclip and the Connections steps, before the Studio basics and Settings steps, shall check, in order, each on the open workspace, each through Studio's windows and then through the test Paperclip's API:

9. **Inbox:** the Inbox shows the seeded card, under none of the lines that say the Inbox is showing an old list ("Showing what it said last.", "Showing what was read last.", "Couldn't load the items from your agents."), Approve answers it, the card leaves Needs you ("Nothing is waiting for you.", going **Back to Inbox** when the answered card stays open), the list then shows none of those lines either, and Paperclip has the card approved. A `STALE_INBOX` failure names the load the line's `data-failed` gives (`inbox.stale-source`).
10. **Messenger:** in the Halonic Messenger window, a message sent in the seeded chat is a comment on that chat in Paperclip, and the seeded agent's chat row and the open chat's header each show its picture (Paperclip gives every agent one), not its initials.
11. **Search:** Ctrl+K and the seeded task's title find the task, and its result opens.
12. **Overview and recap:** Overview shows the recap and the blocked list.
13. **Start menu shortcuts:** with Halonic running, the Halonic Inbox shortcut opens a new window in the running app, showing Needs you empty after step 9's answer, and the Halonic Messenger shortcut shows a window with the seeded chat. Each window shall sit in its app's frame (`studio.src-tauri.app-frames`): its shortcut leaves exactly one visible top-level window whose process image is `Halonic Inbox.exe` or `Halonic Messenger.exe`, no new top-level window of `Halonic.exe`, and a second start of the shortcut leaves that one frame, failing as `NO_FRAME`, `NOT_IN_FRAME` or `SECOND_FRAME`. The click test never closes the app's windows itself.
14. **Disconnect:** Settings › Connections › Disconnect, confirmed, says the key is revoked, and Paperclip refuses the key Studio signed in with.

Each of these steps needs step 3; when it didn't pass, they are skipped.

## Examples

- Given an Inbox that shows the seeded card under "Showing what was read last.",
  then step 9 fails as `STALE_INBOX`, with the screen's last words.
- Given an answered card that stays open, and a list behind it under "Showing what it said last."
  whose line names `setup:sandbox`,
  then step 9 goes Back to Inbox and fails as `STALE_INBOX`, naming that load.
- Given an Approve click that never reached Paperclip,
  then step 9 fails as `NOT_ANSWERED_ON_PAPERCLIP`, with the status Paperclip shows.
- Given a message that never became a comment,
  then step 10 fails as `NOT_ON_PAPERCLIP`.
- Given a Messenger that shows the seeded agent's initials instead of its picture,
  then step 10 fails as `NO_AGENT_PICTURE`, naming the chat row, the header or both.
- Given a Studio with no Overview in Places,
  then step 12 fails as `NO_OVERVIEW`.
- Given a Disconnect after which the key still works,
  then step 14 fails as `KEY_NOT_REVOKED`.
