# studio.src-tauri.tray-status-lines

- Status: draft
- Since: unreleased
- Source: HAL-18279; the tray menu's "every state" render on the board card HAL-14213, B1 (HAL-14206)

While runs wait for the user's answer, the tray's menu shall start with a line that says how many ("1 run needs you", "2 runs need you"), before its status line. The status line, the icon's dot and the "Quitting…" line shall count only the runs in progress, not the ones waiting. While routines aren't paused and an engine reports its next routine, the status line shall end with " · next routine at HH:MM", the earliest of every workspace's, on this computer's clock. If a next routine's time doesn't parse, then the shell shall show the status line without it.

## Examples

- Given no run going and a routine due at 13:00 UTC on a computer at UTC+1,
  when the user opens the tray's menu,
  then its first line is "Nothing running · next routine at 14:00".
- Given 2 runs going, 1 of them waiting for an approval, and a routine due at 14:00,
  when the user opens the tray's menu,
  then its lines start "1 run needs you", "1 run in progress · next routine at 14:00".
- Given routines paused and 1 run waiting,
  when the user opens the tray's menu,
  then its lines start "1 run needs you", "Routines paused".
