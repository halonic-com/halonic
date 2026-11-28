# shell.rail-inner-mark

- Status: active
- Since: unreleased
- Source: HAL-21085 (look check of #6933 on HAL-21048)

While a rail entry with a place's drawing is selected and the theme is dark, the icon rail shall draw the drawing's inner marks (Runs' triangle, Changes' plus and minus, Inbox's tray line) in the text colour over the glass fill, so they read at 3:1 or more against it. While the theme is light, the rail shall leave those marks as cut-outs, as `shell.rail-dot-seat` draws them.

## Examples

- Given the dark theme and Runs selected,
  when the rail is shown,
  then Runs' triangle is drawn in the near-white text colour and reads at 3:1 or more on the glass.
- Given the light theme and Inbox selected,
  when the rail is shown,
  then the line over Inbox's drawing is see-through, and its tray line shows the circle through the glass.
