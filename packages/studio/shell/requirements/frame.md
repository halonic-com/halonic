# shell.frame

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); design direction 2 (HAL-49); UX checklist part 1, 1.1 and 1.6 (HAL-1323); kit design check C6 and C7 (HAL-1495, HAL-1560); HAL-973 (E1, E3)

The shell shall give the Studio window one frame, `ShellFrame`. On the desktop, the frame shall show three layers: a 40px title bar on the halo, then the panel with the toolbar as its first row and the sidebar beside the page (`main`) below it, then a 24px status bar. While the window is narrower than `PHONE_MAX_WIDTH`, the frame shall show the page only, with no title bar, toolbar, sidebar or status bar, and shall switch between the two layouts when the width crosses `PHONE_MAX_WIDTH`, without a reload. The frame shall tell the parts inside it which layout is shown through the kit's `PresentationProvider`. The frame shall set `<html lang>` to the Studio's language. The frame shall mount a polite and an assertive live region into the window's announcer once, and shall send every kit Dialog's regions to the same announcer. When Esc is pressed outside an open `<dialog>`, the frame shall pass it to the window's close stack, with whether an input method is composing, and shall stop the key from going further only when a layer took it. The frame shall tell the announcer when the window gains or loses focus.

## Examples

- Given a window 1440px wide,
  when the frame renders with a toolbar "Back" and the page "Home",
  then the window shows the title bar, the toolbar with "Back", the page in `main` and the status bar, in that order.
- Given the same window narrowed to 400px,
  when the width crosses 600px,
  then only the page shows, and the kit parts inside read the `phone` presentation.
- Given the language `en`,
  when the frame renders,
  then `<html lang="en">` is set.
- Given a menu registered with the close stack,
  when Esc is pressed in the page,
  then the menu closes and the key goes no further; pressed again with nothing open, the key goes on.
- Given an open Dialog,
  when Esc is pressed inside it,
  then the frame leaves the key to the Dialog and closes no layer under it.
- Given "Saved key for Anthropic" is announced,
  when the next frame comes,
  then the frame's polite region reads it.
