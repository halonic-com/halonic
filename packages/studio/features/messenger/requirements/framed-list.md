# messenger.framed-list

- Status: active
- Since: unreleased
- Source: the board's correction on HAL-10 (26 Nov, 16:53 UTC), built on HAL-19921; changed to the new design's two columns on HAL-20730 (P4 of the HAL-20617 build plan, the part recipes in Noah's `COMPONENTS.md` on HAL-20672), as the approved mockup (`v26-messenger-light.png` on HAL-20617) and Sofia's flows (HAL-20673, line 38) draw them

The Messenger shall draw its page on the window's one framed panel (`focusedPanelClass`: rounded corners and a 1px line in the border colour, on the panel colour `app-panel`). While the Messenger shows its list and the open chat side by side, it shall draw its list of chats as a list column of the kit's list-column size (`kit.list-column`), with its rows 8px in from both sides, and the open chat beside it, past a 1px line in the border colour, in a content pane, both on the panel colour. While nothing is connected and the window is wide enough for both, the Messenger shall leave the list column out, so No connections is the panel's one message. Beside the chat or as a sheet over its end, the chat's activity panel shall have a 1px line at its start edge and none at its other edges; in the chat's place it shall have no line at its edges; in each place it shall be on the panel colour, with no rounded corners. Beside the chat, the activity panel's header shall be as tall as the chat's header, 64px. The list's header shall sit 20px in from both sides, in line with the rows' pictures and times. The panel and border colours shall be the theme's tokens, so the Messenger follows the light and the dark theme.

## Examples

- Given the Messenger in a 1280 × 800 window with Chief's chat open,
  when it shows,
  then the page is one framed panel with rounded corners and a 1px line, the list column is 34% of the page, at least 208px and at most 380px, its rows sit 8px in from both sides, and the chat shows beside it past a 1px line, both on the panel colour.
- Given Chief's chat with its activity panel open beside it,
  when it shows,
  then the activity panel sits past a 1px line from the chat, on the panel colour.
- Given Chief's chat in a 1000px window,
  when the board opens its activity,
  then the activity panel is a sheet over the chat's end with a 1px line at its start edge only, no rounded corners, on the panel colour.
- Given nothing connected in a 1280 × 800 window,
  when the Messenger shows,
  then it has no list column, and No connections is the panel's one message.
