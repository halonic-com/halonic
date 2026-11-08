# routines.next-cron-time

- Status: active
- Since: 0.1.0
- Source: `nextCronTime` in the old routines package (`packages/core/routines/src/cron.ts`) at 784f78d

When the next time of a cron schedule is asked for after a given instant, the routines package shall return the first whole minute strictly after that instant whose wall-clock time in the given time zone (or the machine's zone) matches every field, using OR between day-of-month and day-of-week when both are restricted, and shall return null when no minute matches within about five years.

## Examples

- Given `0 8 * * 1-5` in UTC after Friday 2026-11-06 09:00, when the next time is asked for, then it is Monday 2026-11-09 08:00.
- Given `*/15 * * * *` in UTC after 2026-11-03 10:07:30, when the next time is asked for, then it is 10:15.
- Given `0 0 29 2 *` in UTC after 2026-03-01, when the next time is asked for, then it is 2028-02-29 00:00.
- Given `0 * * * *` in UTC after exactly 10:00, when the next time is asked for, then it is 11:00.
- Given `0 9 1 * mon` in UTC after Sunday 2026-11-01 10:00, when the next time is asked for, then it is Monday 2026-11-02 09:00.
- Given `0 8 * * *` in Europe/Amsterdam after 2026-11-03 00:00Z, when the next time is asked for, then it is 07:00Z (CET); after 2026-07-01 00:00Z it is 06:00Z (CEST).
- Given `0 8 * feb mon` in UTC after 2026-11-03, when the next time is asked for, then it is 2027-02-01 08:00.
- Given `0 0 30 2 *`, when the next time is asked for, then it is null.
