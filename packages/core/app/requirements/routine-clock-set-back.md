# app.routine-clock-set-back

- Status: active
- Since: unreleased
- Source: HAL-16338

When the routine scheduler ticks and the stored last tick is more than 10 minutes after the clock's time, the scheduler shall start nothing in that tick and store the clock's time as the workspace's last tick, so the next tick asks what is due from then on: the clock was set back, and routines would otherwise wait until it caught up. When the stored last tick is after the clock's time by 10 minutes or less, as another host's clock may be, the tick shall start nothing and store nothing (`app.routine-scheduler`).

## Examples

- Given an hourly routine and a last tick stored at 07:00 two days ahead of the clock,
  when the scheduler ticks at 07:00:30 and again at 08:00:20,
  then the first tick starts nothing and stores 07:00:30, and the second starts the 08:00 run.
- Given a last tick stored at 07:05 and a tick at 07:00:30,
  when the scheduler ticks,
  then it starts nothing, and 07:05 stays the last tick.
