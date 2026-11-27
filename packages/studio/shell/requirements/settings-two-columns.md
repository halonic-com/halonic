# shell.settings-two-columns

- Status: active
- Since: unreleased
- Source: HAL-20733 (P5 of the HAL-20617 build plan, the two-column layout in the `team-handover` document); Settings stays a dialog, decided by Liam on HAL-20733

The Settings dialog shall show its list named "Settings sections" as a list column of 34% of the dialog's width, at least 208px and at most 380px, on the frame colour (`app-frame`). The shell shall show the current section beside it, past a 1px line in the border colour, in a content pane on the panel colour (`app-panel`). The shell shall fill the current section's row with a list's selected colour (`accent-soft`) and leave every other row unfilled until the pointer is over it. The frame, panel and selected colours shall be the theme's tokens, so the dialog follows the light and the dark theme.

## Examples

- Given Settings opens on Appearance,
  when the dialog shows,
  then the list column is on the frame colour, Appearance's row has the selected fill, and Appearance's settings show in the content pane on the panel colour.
- Given Settings shows Appearance,
  when the person clicks Formats,
  then Formats' row has the selected fill and Appearance's row has none.
