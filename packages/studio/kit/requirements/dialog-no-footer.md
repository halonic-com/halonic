# kit.dialog-no-footer

- Status: active
- Since: 0.1.0
- Source: HAL-1294; HAL-1102 save model (decided: the Studio saves by itself); flow-settings 3 and ux-checklists-t4-t5-t11 3.1 ("no footer")

When a `Dialog` has no `confirm`, the kit shall draw it without a footer and without Cancel, and shall show the header's close button on desktop and on a phone. Focus shall start on the element `initialFocus` returns, else on the first field in the body that is neither disabled nor inside a `hidden` element, else on the close button. Escape, the close button and a click that starts and ends on the overlay shall call `onCancel`, as in `kit.dialog`.

## Examples

- Given a footerless Dialog "Settings" whose `initialFocus` returns the "Appearance" row,
  when it mounts,
  then focus is on "Appearance", there is no footer, and Escape calls `onCancel`.
- Given a footerless Dialog on a phone with no field in its body,
  when it mounts,
  then the close button "Close Settings" is shown and has focus.
