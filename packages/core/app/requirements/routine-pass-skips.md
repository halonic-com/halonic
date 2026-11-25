# app.routine-pass-skips

- Status: active
- Since: unreleased
- Source: HAL-17186; the maintainer's finding on HAL-17177 (Pause routines in the tray, B1, HAL-14206)

When a pass moves a workspace's last tick (`app.routine-pass`), the app shall record the times that fell due in between as one `paused` skip row per routine, with their count, so the routine's skipped times show what it missed while routines were paused. Successive passes with no run of the routine in between shall add to the same row. If another tick stores a last tick first, then the pass shall record nothing, as that tick covered those times itself.

## Examples

- Given an hourly routine ticked at 07:00:30,
  when the host passes at 08:30:00 and 09:30:00,
  then the routine has one `paused` row from 08:00 to 09:00 with a count of 2.
- Given a routine due every minute with catch-up "run every missed time", ticked two days ago,
  when the host passes,
  then its one `paused` row counts every minute of those two days.
