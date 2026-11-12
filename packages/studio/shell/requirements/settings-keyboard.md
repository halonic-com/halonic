# shell.settings-keyboard

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); flow-settings 3 (HAL-646); UX checklist part 3, 3.2 (HAL-1185)

When Settings opens, the shell shall put the focus on the current section's row. The settings list shall be one Tab stop. While the focus is in the list, ↓ and ↑ shall move it to the next and previous row across the groups, and Home and End to the first and last row, without switching the section. When the user presses Enter on a row or clicks it, the shell shall show that section, keep the focus on the row, and say the section's name politely. When the focus leaves the list, the list's Tab stop shall go back to the current section's row.

## Examples

- Given Settings opened on Appearance,
  when it shows,
  then the focus is on the Appearance row.
- Given the focus is on Appearance, the first row,
  when the user presses ↓,
  then the focus moves to Formats and Appearance still shows.
- Given the focus is on Formats,
  when the user presses Enter,
  then Formats shows, the focus stays on its row, and "Formats" is said.
- Given the user moved the focus to Formats with ↓ while Appearance shows,
  when the focus leaves the list,
  then the Appearance row is the list's Tab stop again.
