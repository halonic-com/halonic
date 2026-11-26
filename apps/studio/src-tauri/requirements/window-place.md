# studio.src-tauri.window-place

- Status: draft
- Since: unreleased
- Source: HAL-19204 (board request: FancyZones keeps one place per exe, so the Inbox and the Messenger opened in the same zone); the windows in `studio.src-tauri.focused-apps`; the plugin approved on HAL-19212

When Studio's, the Inbox's or the Messenger's window opens on the desktop, the shell shall put it back where that window was when it last closed or Halonic last quit: its own position, size and maximised state, kept by its window label (`main`, `inbox`, `messenger`) in physical pixels, so it lands on the same pixel at any display scale. The window shall show only once it is in that place. Where less than 64 pixels of it, across or down, would be on any connected screen, the shell shall put it in the middle of the primary screen's work area instead, no bigger than that area. The shell shall never keep whether a window shows, and shall keep no place for its other windows (the feedback and brief windows). No page shall be granted the window state plugin's commands.

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
- Given Studio's window hidden in the tray when Halonic quit,
  when Halonic starts again,
  then Studio's window shows.
