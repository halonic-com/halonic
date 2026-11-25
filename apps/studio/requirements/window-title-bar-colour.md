# studio.window-title-bar-colour

- Status: active
- Since: unreleased
- Source: HAL-18698; the board's addition on HAL-18691 ("the window title bar should be the same color as the frame"); the command in `studio.src-tauri.frame-colour`

When the desktop app's page starts, it shall tell the shell its frame's colour as `#rrggbb` through `set_frame_colour`, and again whenever the theme, the frame colours or the system's light or dark setting change that colour, but not when the colour stayed the same. A focused app's window shall send its frame colour, `--color-app-frame`. Studio's window shall send the colour where its halo starts, at the top left: the first of the frame colours in Settings laid over the canvas, 30% in light and 15% in dark. A refusal shall go to the console.

## Examples

- Given the Inbox window in light, on a frame of slate-75,
  when the page starts,
  then it sends `#f4f7fa` once.
- Given the Inbox window sent `#f4f7fa`,
  when the theme changes to dark,
  then it sends the dark frame's colour, and a change that keeps the colour sends nothing.
- Given Studio's window in light with the blue-and-purple frame colours,
  when the page starts,
  then it sends `#3b8bff` laid over the canvas at 30%.
- Given a computed colour of `rgb(244, 247, 250)` or `color(srgb 0.957 0.969 0.98)`,
  then it is `#f4f7fa`, and a see-through colour is none.
