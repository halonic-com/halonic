# messenger.typing-offline

- Status: active
- Since: unreleased
- Source: Julian's review of halonic-com/halonic#6454 (HAL-19428), follow-up HAL-19503 (26 Nov).

While the conversation's source is offline or signed out, the Messenger shall not show "<Agent> is typing…", whatever the source's last read said about the agent's run. When the source is online again and says the run still goes on, the line shall show again.

## Examples

- Given the board sent "Thanks" to Chief, Chief's run on the chat has started, and "Chief is typing…" shows,
  when Chief's source goes offline,
  then the line goes away.
- Given the same chat, with Chief's source offline,
  when the source is online again and Chief's run still goes on,
  then "Chief is typing…" shows again.
