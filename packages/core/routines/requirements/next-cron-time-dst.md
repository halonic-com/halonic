# routines.next-cron-time-dst

- Status: active
- Since: 0.1.0
- Source: `nextCronTime` in the old routines package (`packages/core/routines/src/cron.ts`) at 784f78d; the daylight saving rules were decided in HAL-431

While a time zone changes its UTC offset, the next cron time shall work as in classic cron: a job with a wildcard hour (`*` or `*/n`) shall follow the wall clock, firing in both copies of a repeated hour and not making up skipped minutes; a job at set hours shall fire at most once for each wall time, only in the first copy of a repeated hour, and, when one or more of its times fall in a gap the clocks skip, once at the first minute after the gap; and no matching minute after the change shall be missed.

## Examples

- Given `30 0 * * 1` in America/New_York after Saturday 2026-03-07 17:00Z (the day before clocks go forward), when the next time is asked for, then it is Monday 2026-03-09 00:30 EDT (04:30Z).
- Given `30 2 * * *` in America/New_York after 2026-03-08 00:00 EST, when the next time is asked for, then it is 03:00 EDT that day, because 02:30 doesn't exist; after that it is 2026-03-09 02:30 EDT.
- Given `0,30 2 * * *` in America/New_York after 03:00 EDT on 2026-03-08, when the next time is asked for, then it is 2026-03-09 02:00 EDT: both skipped times were made up together at 03:00.
- Given `15 * * * *` in America/New_York after 01:50 EST on 2026-03-08, when the next time is asked for, then it is 03:15 EDT; 02:15 is not made up.
- Given `0 3 * * *` in America/New_York after 01:58:30 EST on 2026-03-08, when the next time is asked for, then it is 03:00 EDT, the first minute after the gap.
- Given `15 2 * * *` in Australia/Lord_Howe (a 30-minute change) after 2026-10-03 12:00Z, when the next time is asked for, then it is 2026-10-04 02:30 +11:00.
- Given `0 1 * * 0` or `0 0 * * *` in America/Santiago after 2026-09-05 16:00Z, when the next time is asked for, then it is Sunday 2026-09-06 01:00 -03:00, the first minute of that day.
- Given `30 1 * * *` in America/New_York on 2026-11-01, when the next time is asked for repeatedly, then it is 01:30 EDT, then 01:30 EST on 2026-11-02.
- Given `* 1 * * *` in America/New_York after 01:59 EDT on 2026-11-01, when the next time is asked for, then it is 01:00 EST on 2026-11-02.
- Given `*/15 * * * *`, `0 * * * *` or `* * * * *` in America/New_York on 2026-11-01, when the next time is asked for before 01:00 EST, then it is 01:00 EST (06:00Z), in the second copy of the hour.
- Given `0 0 * * 0` in America/Santiago after 2026-04-04 12:00Z (a 25-hour Saturday), when the next time is asked for, then it is Sunday 00:00 -04:00; `30 23 * * 6` fires once, at 23:30 -03:00.

## Differences from the old routines package

- **Bug fix.** The old code counted each skip in wall-clock minutes but took it in real minutes, so a skip across a spring-forward change landed an hour late and missed the minutes just after the boundary. `30 0 * * 1` in New York, asked on 2026-03-07, fired on 2026-03-16 instead of 2026-03-09. Regression test in `next-cron-time.test.ts`.
- **Repeated hour (decided in HAL-431).** The old code fired every real minute whose wall time matched, so `30 1 * * *` fired twice on 2026-11-01 in New York (its comment said once). A job at set hours now fires once; a wildcard hour job still runs through both copies. The scheduler's `due` tick relies on each (routine, scheduled time) firing at most once.
- **Skipped hour (decided in HAL-431).** The old code didn't fire a set time that fell in the gap that day: `30 2 * * *` in New York next fired on 2026-03-09. It now fires once at the first minute after the gap.
