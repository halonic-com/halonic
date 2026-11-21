# kit.toast-clear-of-focus

- Status: active
- Since: unreleased
- Source: HAL-14028 (UX check C289, TO1; WCAG 2.4.11 Focus Not Obscured); team decision under HAL-2282, a detail of the approved toast

While the Studio is in its phone layout, when the drawn toast would cover the element that has focus, the `ToastRegion` shall sit at the top of its wrapper for that toast, 8px under the bars above the page, or 8px under the window's top once a short window has scrolled them away, unless it would cover the focused element there as well. It shall check when the toast is drawn, before it is painted, and whenever focus moves while that toast is at the bottom, and shall go back to the bottom for the next toast. On desktop, and when the toast doesn't cover the focused element, it shall stay where `kit.toast` places it. What a toast says and how long it stays shall not change.

## Examples

- Given a phone window 195px wide and a focused button where the toast sits at the bottom,
  when a toast is shown,
  then the region sits 8px under the top bar and covers no part of the button.
- Given a phone window 320px wide and a focused button above the toast,
  when a toast is shown,
  then the region stays at the bottom.
- Given a toast at the bottom and a menu item that made it,
  when the menu hands focus back to its ⋮ under the toast,
  then the region moves to the top.
