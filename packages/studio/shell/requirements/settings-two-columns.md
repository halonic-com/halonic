# shell.settings-two-columns

- Status: active
- Since: unreleased
- Source: HAL-20733 (P5 of the HAL-20617 build plan, the two-column layout in the `team-handover` document); Settings stays a dialog, decided by Liam on HAL-20733; the list and its current row from the part recipe for a list row (Noah's `COMPONENTS.md` on HAL-20672)

The Settings dialog shall show its list named "Settings sections" as a list column of 34% of the dialog's width, at least 208px and at most 380px, on the panel colour (`app-panel`). The shell shall show the current section beside it, past a 1px line in the border colour, in a content pane on the panel colour. The shell shall fill the current section's row with the muted fill (`surface-muted`), the same fill a row has under the pointer, and leave every other row unfilled until the pointer is over it. The panel and muted colours shall be the theme's tokens, so the dialog follows the light and the dark theme.

## Examples

- Given Settings opens on Appearance,
  when the dialog shows,
  then the list column and the content pane are on the panel colour, Appearance's row has the muted fill, and Appearance's settings show in the content pane.
- Given Settings shows Appearance,
  when the person clicks Formats,
  then Formats' row has the muted fill and Appearance's row has none.
