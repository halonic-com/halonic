# studio.window-title-bar-colour

- Status: active
- Since: unreleased
- Source: HAL-18698; the board's addition on HAL-18691 ("the window title bar should be the same color as the frame"); the command in `studio.src-tauri.frame-colour`; the board's choice on HAL-20499 (Studio's frame as the Messenger's)

When the desktop app's page starts, it shall tell the shell its frame's colour as `#rrggbb` through `set_frame_colour`, and again whenever the theme or the system's light or dark setting change that colour, but not when the colour stayed the same. Studio's window and a focused app's window shall both send the app frame's colour, `--color-app-frame`, so Studio's title bar matches the Messenger's. A refusal shall go to the console.

## Examples

- Given the Inbox window in light, on a frame of slate-75,
  when the page starts,
  then it sends `#f4f7fa` once.
- Given the Inbox window sent `#f4f7fa`,
  when the theme changes to dark,
  then it sends the dark frame's colour, and a change that keeps the colour sends nothing.
- Given Studio's window in light, on a frame of slate-75,
  when the page starts,
  then it sends `#f4f7fa`, the same as the Messenger's window.
- Given a computed colour of `rgb(244, 247, 250)` or `color(srgb 0.957 0.969 0.98)`,
  then it is `#f4f7fa`, and a see-through colour is none.
