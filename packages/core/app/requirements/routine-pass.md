# app.routine-pass

- Status: active
- Since: unreleased
- Source: HAL-17177; Pause routines in the tray (B1, HAL-14206), approved by the maintainer on HAL-14220

When a host passes a workspace's routine tick, it shall store the clock's time as the workspace's last tick without starting any run, so the scheduler's next tick skips the times that fell due in between instead of catching them up. If the stored last tick is at or after the clock's time, or another tick stores one meanwhile, then passing shall leave it as it is.

## Examples

- Given an hourly routine ticked at 07:00:30,
  when the host passes at 08:30:00 and 09:30:00 and ticks at 10:00:30,
  then the tick starts only the 10:00 run.
- Given a last tick stored at 09:00:00,
  when the host passes with the clock at 08:00:00,
  then the last tick stays 09:00:00.
