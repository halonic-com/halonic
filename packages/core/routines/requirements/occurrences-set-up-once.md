# routines.occurrences-set-up-once

- Status: active
- Since: 0.1.0
- Source: HAL-2524, Liam's review of the tick's skip counts

When listing the times a schedule fires, the routines package shall read the schedule and set up its zone once for the whole list, not once for each time, so that counting up to 10,000 skipped times of an every-minute cron stays fast enough for a tick.

Before, each step read the cron again and built a new zone formatter. A tick after a 14-day gap with 20 every-minute crons took 15 to 34 seconds; with this, about 2.

## Examples

- Given `* * * * *` in UTC and a window of 2,000 minutes, when the times are listed, then the zone formatter is built once and 2,000 times are listed.
