# inbox.framed-sidebar

- Status: active
- Since: unreleased
- Source: the board's correction on HAL-19923 (the Messenger's framed sidebar, the same in the Inbox), plan approved by Liam on HAL-19929; built on HAL-19924

Where the Inbox has its own window, Halonic Inbox, the Inbox shall draw its list on the window's frame and the open item on a framed panel 8px beside it, with the kit's framed sidebar (`kit.framed-sidebar`), the same as the Messenger's and Studio's. Where the Inbox is in Studio's window, whose page already sits on Studio's framed panel, the Inbox shall draw its list and the open item on that panel, with a 1px line between them. While its window shows one pane at a time, the Inbox shall fill the frame with the list, and the framed panel with an open item, as in the Messenger.

## Examples

- Given the Inbox window with an item open,
  when it shows,
  then the list sits on the frame with no line of its own, and the item is a framed panel 8px beside it.
- Given the Inbox in Studio's window,
  when it shows,
  then the list and the item share Studio's panel, with a 1px line between them.
