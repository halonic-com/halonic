# routines.wall-time

- Status: active
- Since: 0.1.0
- Source: `wallTime` in the old routines package (`packages/core/routines/src/cron.ts`) at 784f78d

When the wall time of an instant is read, the routines package shall return the year, month (1 = January), day, hour (0-23), minute and weekday (0 = Sunday) that a clock in the given IANA time zone shows at that instant, or in the machine's own zone when none is given, using only the standard `Intl` APIs.

## Examples

- Given 2026-11-03T07:00Z and Europe/Amsterdam, when the wall time is read, then it is 08:00 on a Tuesday (weekday 2).
- Given 2026-10-31T23:30:59Z and Asia/Tokyo, when the wall time is read, then it is 2026-11-01 08:30, a Sunday (weekday 0).
- Given midnight UTC and the zone UTC, when the wall time is read, then the hour is 0, not 24.
- Given no zone, when the wall time is read, then it equals the wall time in the machine's resolved zone.
