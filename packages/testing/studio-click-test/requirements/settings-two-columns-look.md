# studio-click-test.settings-two-columns-look

- Status: active
- Since: unreleased
- Source: Nora's review of #6867 on HAL-20733: `shell.settings-two-columns` is something a user sees, so a click step checks it in the running app (HAL-20767)

When the click test opens Settings on Appearance, it shall read the width the app drew for the list named "Settings sections" and for the row that holds it, and shall fail the step as `LIST_COLUMN_WIDTH`, naming both widths, unless the list is 34% of the row, at least 208px and at most 380px, within 1px. The click test shall read the background colour of the current section's row and of another row, and shall fail the step as `ROW_FILL`, naming both colours, unless only the current row has a fill. The click test shall then pick Theme Dark, read both rows again the same way, pick System again, and shall fail the step as `FILL_NOT_THEMED` when the current row's fill is the same in light and in Dark. Where the list isn't in the dialog, it shall fail the step as `NO_LIST_COLUMN`.

## Examples

- Given a list 272px wide in an 800px row, a current row drawn `rgb(240, 240, 243)` in light and `rgb(39, 39, 42)` in Dark, and another row unfilled,
  then the step passes and leaves the window on System.
- Given a list 160px wide in an 800px row,
  then the step fails as `LIST_COLUMN_WIDTH`, naming 160px and 800px.
- Given another row drawn with the same fill as the current row,
  then the step fails as `ROW_FILL`, naming both colours.
- Given a current row drawn `rgb(240, 240, 243)` in light and in Dark,
  then the step fails as `FILL_NOT_THEMED`.
