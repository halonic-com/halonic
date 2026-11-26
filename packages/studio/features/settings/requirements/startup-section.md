# settings.startup-section

- Status: active
- Since: unreleased
- Source: HAL-18087 (B1 step 6b); board card on HAL-14213 ("Setting" render, 20 Nov); HAL-14221 (`login_item_get`, `login_item_set`); HAL-19534 (board request: "Reopen windows on start", on by default)

Where the app gives a login item (the desktop app), the Settings window shall list **Startup** under "On this computer", after Trusted sources and before About Halonic, and Ctrl K shall find it as **Startup**. Where the app gives none (served Studio, the demo, and the desktop app on Linux, where a start at login can't stay in the tray), the section, its row and its Ctrl K command shall not show. The line under the section's name shall read "When you close the window, Halonic keeps running in the tray, so your routines keep running. Quit it from its icon to stop everything.", with "in the menu bar" in place of "in the tray" on macOS. The section shall hold two switches. The first is **Start Halonic when I log in**, with the hint "Halonic starts in the tray without opening a window, and runs the routines of the workspaces you had open when you last quit. Off, routines run only after you open Halonic." (macOS: "in the menu bar"). Opening the section shall only read the login item; the switch shall change it only on a press, and shall show what the shell last answered. When the shell refuses with `not_installed` or `failed`, a short line under the switch shall say why, and the switch shall keep what it showed before. The second is **Reopen windows on start**, the host setting `windows.reopen-on-start` that the shell reads at start (`studio.src-tauri.open-windows`), on when nothing is saved; a press shall save it at once, and a save that fails shall put the switch back, with the line "Couldn't save "Reopen windows on start" on this computer." under it. While the host settings can't be read, the section shall show the login item's switch, and in place of the second one the line "Couldn't load the startup settings" with Try again.

## Examples

- Given served Studio, which gives no login item,
  when Settings opens,
  then it has no Startup row, and Ctrl K has no **Startup**.
- Given the desktop app on Windows with the login item off,
  when Settings › Startup opens,
  then it reads the description with "in the tray" and shows **Start Halonic when I log in** off.
- Given the switch is off,
  when the person presses it and the shell turns the login item on,
  then the shell was asked to turn it on and the switch shows on.
- Given Halonic doesn't run from where it was installed,
  when the person presses the switch,
  then the shell refuses with `not_installed`, the line "Couldn't turn this on: only an installed Halonic can start when you log in. Install Halonic, then try again." shows under the switch, and the switch stays off.
- Given nothing saved for `windows.reopen-on-start`,
  when Settings › Startup opens,
  then **Reopen windows on start** shows on.
- Given **Reopen windows on start** on,
  when the person presses it,
  then `windows.reopen-on-start` is saved `false` and the switch shows off.
