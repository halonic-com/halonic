# studio.src-tauri.frame-colour

- Status: draft
- Since: unreleased
- Source: HAL-18698; the board's addition on HAL-18691 ("the window title bar should be the same color as the frame"); the page's side in `studio.window-title-bar-colour`

When the page calls `set_frame_colour` with a `#rrggbb` colour on Windows, the shell shall colour the title bar of that page's own window with it, and its title text slate-900 on a light colour and slate-50 on a dark one, whichever has the more contrast. It shall refuse anything but `#rrggbb` as `invalid` and change nothing. Where Windows can't colour the bar, as on Windows 10, it shall be refused as `failed`, with Windows' answer in the shell's log, and the bar shall keep the system's colour. On macOS and Linux it shall do nothing. Only Studio's, the Inbox's and the Messenger's windows shall be granted it, and never the Studio the computer serves.

## Examples

- Given the Inbox window on Windows 11,
  when its page calls `set_frame_colour` with `#f4f7fa`,
  then its title bar is `#f4f7fa` with slate-900 text, and Studio's window is unchanged.
- Given the same window,
  when its page calls `set_frame_colour` with `#020617`,
  then the bar is `#020617` with slate-50 text.
- Given any window,
  when its page calls `set_frame_colour` with `rgb(1 2 3)`,
  then it is refused as `invalid`.
- Given the Studio the computer serves,
  when it calls `set_frame_colour`,
  then it is refused as not allowed.
