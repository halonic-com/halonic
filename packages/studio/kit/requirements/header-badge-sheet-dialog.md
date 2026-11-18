# kit.header-badge-sheet-dialog

- Status: active
- Since: unreleased
- Source: component specs 15.3 and 20.2, WCAG 2.4.11; HAL-12879

The kit's `HeaderBadgeSheetDialog` shall show the `HeaderBadgeSheet` it is given in a full-screen `<dialog>` named by the sheet's title and opened with `showModal()`, so that while it is open nothing outside it can take focus. When it opens, focus shall move to the sheet's title. When the user presses Escape, it shall call `onClose`. When it closes, focus shall go back to the element that had it before.

## Examples

- Given a button "Workspace: Acme" with focus,
  when its sheet "Workspace" opens,
  then the sheet is in a dialog named "Workspace" opened with `showModal()`, and the title "Workspace" has focus.
- Given that, when the user presses Escape, then `onClose` is called.
- Given that, when the sheet closes, then "Workspace: Acme" has focus again.
