# messenger.framed-list

- Status: active
- Since: unreleased
- Source: the board's correction on HAL-10 (26 Nov, 16:53 UTC), built on HAL-19921; changed to the new design's two columns on HAL-20730 (P4 of the HAL-20617 build plan, the part recipes in Noah's `COMPONENTS.md` on HAL-20672), as the approved mockup (`v26-messenger-light.png` on HAL-20617) and Sofia's flows (HAL-20673, line 38) draw them

The Messenger shall draw its page on the window's one framed panel (`focusedPanelClass`: 12px rounded corners and a 1px line in the border colour, on the panel colour `app-panel`). While the Messenger shows its list and the open chat side by side, it shall draw its list of chats as a list column of the kit's list-column size (`kit.list-column`), with its rows 8px in from both sides, and the open chat beside it, past a 1px line in the border colour, in a content pane, both on the panel colour. While the chat's activity panel shows beside the chat, it shall sit past a 1px line from the chat, on the panel colour. The panel and border colours shall be the theme's tokens, so the Messenger follows the light and the dark theme.

## Examples

- Given the Messenger in a 1280 × 800 window with Chief's chat open,
  when it shows,
  then the page is one framed panel with rounded corners and a 1px line, the list column is 34% of the page, at least 208px and at most 380px, its rows sit 8px in from both sides, and the chat shows beside it past a 1px line, both on the panel colour.
- Given Chief's chat with its activity panel open beside it,
  when it shows,
  then the activity panel sits past a 1px line from the chat, on the panel colour.
