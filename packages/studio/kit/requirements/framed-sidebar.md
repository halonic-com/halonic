# kit.framed-sidebar

- Status: active
- Since: unreleased
- Source: the board's correction on HAL-19923 (Messenger's sidebar in the frame was right; the same in Studio and the Inbox), plan approved by Liam on HAL-19929; built on HAL-19924; the Messenger left it for the new design's list column on HAL-20730 (`messenger.framed-list`)

The kit shall give the Inbox and Studio one framed sidebar, `SidebarFrame` with `FramedPanel`. The sidebar shall sit on the window's frame with no fill, line, rounded corners or shadow of its own. The sidebar's rows shall end 8px from the panel. The content beside it shall sit 8px away on a framed panel with 12px rounded corners and a 1px line in the border colour, which forced colours draw as a visible edge. The panel's fill shall be the focused app's panel colour in a focused app and the page's surface colour in Studio's window. A second framed panel beside the first shall sit 8px from it, not joined to it.

## Examples

- Given a sidebar and a framed panel,
  when the frame renders,
  then the sidebar has no fill or line, and the panel sits 8px beside it with rounded corners and a 1px line.
- Given a framed panel in Studio's window,
  when it renders,
  then it has the surface fill; in a focused app it has the app panel's fill.
- Given a framed panel asked to be the page's `main`,
  when it renders,
  then it is the `main` element and its ref points at it.
