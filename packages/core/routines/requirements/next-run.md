# routines.next-run

- Status: active
- Since: 0.1.0
- Source: `nextRun` in the old routines package (`packages/core/routines/src/schedule.ts`) at 784f78d

When asked when a trigger fires next after a moment, the routines package shall answer on the same clock as the tick: the next cron time for a schedule, in the given zone when the schedule names none (UTC by default); the next interval slot counted from the Unix epoch for an `every` trigger, whatever its last run; and null for a trigger that doesn't fire on a clock. An unknown zone throws a `CronError`.

The old `nextRun` counted an interval from the last run and gave the moment itself when it never ran or was overdue. It changed so that the next run shown always matches the run the tick starts.

## Examples

- Given `every: "1h"` and 10:00, when the next run is asked, then it is 11:00.
- Given `every: "30m"` and 09:50, after a run at 09:45, when the next run is asked, then it is 10:00, the time the tick starts it.
- Given `0 9 * * *` without a zone, Asia/Tokyo as the given zone and 2026-11-03 10:00 UTC, when the next run is asked, then it is 2026-11-04 00:00 UTC.
- Given a manual trigger, when the next run is asked, then it is null.
