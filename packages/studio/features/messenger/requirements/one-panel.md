# messenger.one-panel

- Status: active
- Since: unreleased
- Source: the board's feedback on HAL-19536, item 5 (the Messenger's side panel joined to the content panel: one surface, no gap or separate card), plan approved by Liam on HAL-19539; built on HAL-19586

The Messenger shall draw its list of chats and the open chat on one panel, with no gap between them and a 1px line at the list's end edge, and with no rounded corners or shadow of their own. While the chat's activity panel shows beside the chat, it shall be part of the same panel, set off by a 1px line at its start edge, not a card of its own.

## Examples

- Given the Messenger with Chief's chat open,
  when it shows,
  then the list and the chat sit on one panel, with a 1px line between them and no gap.
- Given Chief's chat with its activity panel open beside it,
  when it shows,
  then the activity panel joins the chat with a 1px line and no gap, rounded corners or border of its own.
