# shell.frame

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); design direction 2 (HAL-49); UX checklist part 1, 1.1, 1.4 and 1.6 (HAL-1323); kit 9 (HAL-175); kit design check C6 and C7 (HAL-1495, HAL-1560); HAL-973 (E1, E3)

The shell shall give the Studio window one frame, `ShellFrame`. On the desktop, the frame shall show three layers: a 40px title bar on the halo, then the panel with the toolbar as its first row and the sidebar beside the page (`main`) below it, then a 24px status bar. While the window is narrower than `PHONE_MAX_WIDTH`, the frame shall show the page only, with no title bar, toolbar, sidebar or status bar, and shall switch between the two layouts when the width crosses `PHONE_MAX_WIDTH`, without a reload and without remounting the page, so the page keeps its state. The frame shall tell the parts inside it which layout is shown through the kit's `PresentationProvider`. The frame shall set `<html lang>` to the Studio's language. The frame shall mount a polite and an assertive live region into the window's announcer once, and shall send every kit Dialog's regions to the same announcer. When Esc is pressed while no modal `<dialog>` is open, the frame shall pass it to the window's close stack, with whether an input method is composing (`isComposing`, or key code 229 as WebKit sends it), and shall stop the key from going further only when a layer took it. The frame shall tell the announcer when the window gains or loses focus. The frame shall show the window's toasts once, at the bottom right over the sidebar and the page (on a phone, over the page), never over the status bar, and shall give the parts inside it the same toast store.

## Examples

- Given a window 1440px wide,
  when the frame renders with a toolbar "Back" and the page "Home",
  then the window shows the title bar, the toolbar with "Back", the page in `main` and the status bar, in that order.
- Given the same window narrowed to 400px,
  when the width crosses 600px,
  then only the page shows, and the kit parts inside read the `phone` presentation.
- Given a field in the page with typed text and focus,
  when the width crosses 600px and back,
  then the field keeps its text and its focus.
- Given the language `en`,
  when the frame renders,
  then `<html lang="en">` is set.
- Given a menu registered with the close stack,
  when Esc is pressed in the page,
  then the menu closes and the key goes no further; pressed again with nothing open, the key goes on.
- Given an open Dialog,
  when Esc is pressed inside it, or with focus on the body,
  then the frame leaves the key to the Dialog and closes no layer under it.
- Given a menu registered with the close stack,
  when WebKit sends the Esc that ends a composition, with key code 229,
  then the menu stays open.
- Given "Saved key for Anthropic" is announced,
  when the next frame comes,
  then the frame's polite region reads it.
- Given the toast "Saved key for Anthropic" is shown,
  when the frame renders on the desktop or on a phone,
  then one "Notifications" region shows it over the page, and none is in the status bar.
