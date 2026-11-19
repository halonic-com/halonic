# workspace.narrow-window-sheet-focus

- Status: active
- Since: unreleased
- Source: `workspace.narrow-window`, `kit.header-badge-sheet-dialog`, WCAG 2.4.11; HAL-12879

While the desktop app's window is as narrow as a phone and a sheet of More is open (the workspace menu's or the sample chip's), nothing outside the sheet shall take focus: the sheet shall be a modal dialog named by its title, with focus on its title. When the user presses Escape, the sheet shall close and focus shall go back to the row or the chip that opened it.

## Examples

- Given the window is phone-narrow and shows the trusted "Acme sample" on More,
  when the user presses the workspace row,
  then the sheet "Workspace" opens as a modal dialog and its title has focus, so Tab can't reach the controls under it.
- Given that, when the user presses Escape, then the sheet closes and the workspace row has focus.
- Given the same window, when the user presses the chip "Sample answers" and then Escape, then its sheet opens as a modal dialog, closes, and the chip has focus.
