# kit.header-badge-window-sheet

- Status: active
- Since: unreleased
- Source: HAL-12961 (UX check HAL-12952, row S3); base component specs 8, 15.3 and 20.2; WCAG 2.1.2, 2.4.3 and 2.4.11

While it's open, the kit's `HeaderBadgeWindowSheet` shall show a `HeaderBadgeSheet` over a desktop window as narrow as a phone as a modal `<dialog>`, opened with `showModal()` and named after the sheet's title, so that the page under it is inert and Tab and Shift+Tab stay in the sheet. When it opens, the kit shall move focus to the sheet's title. When the user presses Escape, the kit shall call `onClose`, as Back does, and keep the dialog open until the screen unmounts it. When it closes, the kit shall move focus back to what opened it.

## Examples

- Given the "Workspace" sheet opened from More's workspace row,
  when it opens,
  then it is a modal dialog named "Workspace", and focus is on its title.
- Given that sheet,
  when the user presses Escape,
  then `onClose` is called, and the browser's own close is stopped.
- Given that sheet,
  when the screen closes it,
  then focus is back on the workspace row.
