# kit.panel-sheet-dialog

- Status: active
- Since: unreleased
- Source: component specs 15.3 and 23 A2, WCAG 2.4.11; flow-assistant 11.4 (HAL-647); HAL-17739

The kit's `PanelSheetDialog` shall show a panel sheet, the `SidePanel` with Back, its body and its footer, in a full-screen `<dialog>` named by its title (`aria-labelledby`, with no region or other landmark inside it) and opened with `showModal()`, so that while it is open nothing outside it can take focus. When it opens, focus shall move to its title. When the user presses Escape or Back, it shall call `onClose`. When it closes, focus shall go back to the element that had it before, or, when that element has gone, to the element `returnFocus` gives.

## Examples

- Given a button "See what changes" with focus,
  when its sheet "What changes" opens with "Accept all" in its footer,
  then the sheet is a dialog named "What changes", opened with `showModal()`, with no landmark inside it, "Accept all" in it, and the focus on its title.
- Given that, when the user presses Escape or Back, then `onClose` is called.
- Given that, when the sheet closes, then "See what changes" has focus again.
- Given that, when "See what changes" is gone as the sheet closes, then the element `returnFocus` gives has focus.
