# studio.src-tauri.tray

- Status: draft
- Since: unreleased
- Source: HAL-14220; decisions D7 and D9 of the B1 design note (HAL-14206), the security review (HAL-14212), the board card HAL-14213

While Halonic runs on a desktop that has a tray, the shell shall show the Halonic ring there, with its centre showing the background engines' state: a dot while runs are in progress, pause bars while the user paused routines, "!" while an engine is left stopped after crashing 3 times in 5 minutes, and the ring alone otherwise; in colour on Windows and KDE, black as a template on macOS, and white on GNOME. Its menu shall start with a status line that opens Halonic, then Ask…, which shows quick ask's box (`studio.src-tauri.quick-ask-window`), Open Halonic and Pause routines (Resume routines while paused, which covers every workspace and the ones opened after it until the user resumes or quits), with Try again first in the problem state, which starts the stopped engines again, then Quit Halonic, worded as the board card. An engine that doesn't start again after a crash shall leave its workspace in the problem state. On Windows and macOS, when the user closes Studio's window while the tray shows, the shell shall hide the window and keep running, when the last window closes it shall keep running in the tray, and on macOS a click on the Dock icon shall bring Studio's window back. On Linux, where a tray can build with nothing showing, closing the window shall quit until the shell can tell the tray is visible. When the user picks Quit Halonic, the shell shall show "Quitting…" with nothing clickable, stop every engine, then quit. If the desktop has no tray, then closing the window shall quit as before.

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
- Given routines paused from the tray,
  when a window opens another workspace,
  then that workspace's routines are paused too, until Resume routines.
- Given a desktop with no tray, or Linux,
  when the user closes Studio's window,
  then Halonic quits, as before.
