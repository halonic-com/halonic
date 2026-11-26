# messenger.framed-list

- Status: active
- Since: unreleased
- Source: the board's correction on HAL-10 (26 Nov, 16:53 UTC): the Messenger's sidebar was good as it was, in the frame; built on HAL-19921, which takes back `messenger.one-panel` (HAL-19539)

The Messenger shall draw its list of chats on the window's frame, with no panel, border or line of its own, and the open chat on a panel of its own: rounded, with a 1px border, 8px from the list. While the chat's activity panel shows beside the chat, it shall be a panel of its own in the same look, 8px from the chat.

## Examples

- Given the Messenger with Chief's chat open,
  when it shows,
  then the list sits on the frame and the chat on its own rounded panel, 8px to its right.
- Given Chief's chat with its activity panel open beside it,
  when it shows,
  then the activity panel is a rounded panel of its own, 8px from the chat.
