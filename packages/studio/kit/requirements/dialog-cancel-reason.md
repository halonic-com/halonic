# kit.dialog-cancel-reason

- Status: active
- Since: 0.1.0
- Source: HAL-8338; the listed-tools review's "Approve none" and Esc differ (UX checklist N7)

When a `Dialog` is cancelled, the kit shall call `onCancel` with the reason: `"button"` when the footer's Cancel button (whatever its `cancelLabel`) was pressed, and `"dismiss"` for the ✕, Escape, a click on the overlay and a close the browser forced. A `onCancel` that takes no argument keeps working.

## Examples

- Given a Dialog whose `cancelLabel` is "Approve none",
  when someone presses that button,
  then `onCancel` runs with `"button"`.
- Given the same Dialog,
  when someone presses Escape,
  then `onCancel` runs with `"dismiss"`.
