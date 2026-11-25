# messenger.typing

- Status: active
- Since: unreleased
- Source: the board's request on HAL-18736 (HAL-10, 25 Nov, 18:26 UTC); plan approved on HAL-18736 (25 Nov, 19:02 UTC).

While the conversation's source says its agent has a started run on it (`agentWorking`), and no message from the agent came after the person's last message, sent or on its way, the Messenger shall show "<Agent> is typing…" under the conversation's messages, after three dots that fade in and out one after another. Under reduced motion the dots shall stand still. The line shall go away when the run ends or a message from the agent arrives, and it shall not show while the person searches the conversation. A screen reader shall hear the line once when it appears. While the person is at the newest entry, within 24 px, the line appearing shall keep it in view.

## Examples

- Given the board sent "Thanks" to Chief, and Chief's run on the chat has started,
  when the board looks at the chat,
  then "Chief is typing…" shows under "Thanks".
- Given the same chat,
  when Chief's run ends,
  then the line goes away.
- Given the same chat,
  when Chief replies while its run goes on,
  then the line goes away.
- Given the same chat,
  when the board searches it,
  then the line doesn't show.
