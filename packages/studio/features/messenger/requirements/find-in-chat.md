# messenger.find-in-chat

- Status: active
- Since: unreleased
- Source: the Messenger look and layout changes approved by the board on HAL-10 (26 Nov, 03:51 UTC) and HAL-19132 (point 6), Sofia's sketch C on HAL-19134; built on HAL-19141

The open chat's header shall show a find icon instead of a search field. When the person presses it, or Ctrl+F (Cmd+F on macOS) while a chat is open, the Messenger shall open a find bar under the header and put focus in its field. While the field holds text, the chat shall keep every message, mark those that hold the text, ignoring case, show the newest of them with a stronger mark and scroll it into view, and say which it shows of how many ("2 of 5"), or "No message in this chat matches.". Up, and Enter, shall move to the older match, and down, and Shift+Enter, to the newer one, round the ends. Close, and Escape, shall close the bar, clear its marks and put focus back on the find icon.

## Examples

- Given Chief's chat with "Shall I merge #12?" and later "Merged #12.",
  when the person presses Ctrl+F and types "#12",
  then both messages still show, "Merged #12." is the match shown and the bar says "2 of 2".
- Given the same find,
  when the person presses up,
  then "Shall I merge #12?" is the match shown and the bar says "1 of 2".
- Given the same find,
  when the person presses Escape,
  then the bar is gone, no message is marked and focus is on the find icon.
