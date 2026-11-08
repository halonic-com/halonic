# routines.next-run

- Status: active
- Since: 0.1.0
- Source: `nextRun` in the old routines package (`packages/core/routines/src/schedule.ts`) at 784f78d

When asked when a trigger fires next from a moment, the routines package shall answer with the next cron time for a schedule, with one interval after the last run for an `every` trigger (or the moment itself when it never ran or that time has passed), and with null for a trigger that doesn't fire on a clock.

## Examples

- Given `every: "1h"`, no last run and 10:00, when the next run is asked, then it is 10:00.
- Given `every: "1h"`, a last run at 09:30 and 10:00, when the next run is asked, then it is 10:30.
- Given a manual trigger, when the next run is asked, then it is null.
