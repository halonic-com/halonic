# studio.src-tauri.window-place

- Status: draft
- Since: unreleased
- Source: HAL-19204 (board request: FancyZones keeps one place per exe, so the Inbox and the Messenger opened in the same zone); HAL-19534 (board request: every window back fully on a visible screen, fullscreen kept); the windows in `studio.src-tauri.focused-apps`; the plugin approved on HAL-19212

When Studio's, the Inbox's or the Messenger's window opens on the desktop, the shell shall put it back where that window was when it last closed or Halonic last quit: its own position, size, maximised and fullscreen state, kept by its window label (`main`, `inbox`, `messenger`) in physical pixels, so it lands on the same pixel at any display scale. The window shall show only once it is in that place. Where any part of it, more than 16 pixels past an edge (the frame's invisible border), would be off every connected screen's work area, the shell shall move it fully onto the work area it overlaps most, as near its place as fits and no bigger than that area; where it overlaps no screen, the shell shall put it in the middle of the primary screen's work area, no bigger than that area. The shell shall compare windows and work areas in physical pixels on every screen. A maximised or fullscreen window whose middle is on no connected screen shall open maximised or fullscreen on the primary screen. The shell shall never keep whether a window shows, and shall keep no place for its other windows (the feedback and brief windows). No page shall be granted the window state plugin's commands.

## Examples

- Given the Inbox snapped to the left third of the screen and the Messenger to the middle third,
  when Halonic quits and starts again and both are opened,
  then each comes back in its own third, to the pixel.
- Given Studio's window maximised when it was closed to the tray,
  when it is opened again after a restart,
  then it opens maximised.
- Given the Messenger last on a second screen that is no longer connected,
  when it opens,
  then it opens in the middle of the primary screen.
- Given the Inbox last half off the right edge of a screen,
  when it opens,
  then it opens fully on that screen, against its right edge.
- Given Studio's window last 2000 × 1200 on a screen whose resolution is now 1920 × 1080,
  when it opens,
  then it fills that screen's work area.
- Given the Messenger last fullscreen on a second screen that is no longer connected,
  when it opens,
  then it opens fullscreen on the primary screen.
- Given Studio's window hidden in the tray when Halonic quit,
  when Halonic starts again,
  then Studio's window shows.
