# studio.src-tauri.tray

- Status: draft
- Since: unreleased
- Source: HAL-14220; decisions D7 and D9 of the B1 design note (HAL-14206), the security review (HAL-14212), the board card HAL-14213

While Halonic runs on a desktop that has a tray, the shell shall show the Halonic ring there, with its centre showing the background engines' state: a dot while runs are in progress, pause bars while the user paused routines, "!" while an engine is left stopped after crashing 3 times in 5 minutes, and the ring alone otherwise; in colour on Windows and KDE, black as a template on macOS, and white on GNOME. Its menu shall start with a status line that opens Halonic, then Open Halonic (with Try again first in the problem state, which starts the stopped engines again), then Quit Halonic, worded as the board card. When the user closes Studio's window while the tray shows, the shell shall hide the window and keep running, and when the last window closes it shall keep running in the tray. When the user picks Quit Halonic, the shell shall show "Quitting…" with nothing clickable, stop every engine, then quit. If the desktop has no tray, then closing the window shall quit as before.

## Examples

- Given 2 runs in progress,
  when the user opens the tray's menu,
  then its first line is "2 runs in progress" and the icon shows the dot.
- Given an engine that crashed 3 times in 5 minutes,
  when the user picks Try again,
  then the shell starts it again and reconnects its windows.
- Given the tray shows,
  when the user closes Studio's window,
  then the window hides and the engines keep running.
- Given a desktop with no tray,
  when the user closes Studio's window,
  then Halonic quits, as before.
