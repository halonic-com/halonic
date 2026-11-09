# routines.occurrences

- Status: active
- Since: 0.1.0
- Source: `occurrences` in the old routines package (`packages/core/routines/src/schedule.ts`) at 784f78d

When asked for the times a schedule fires between two moments, the routines package shall list them oldest first, leaving out the start, including the end, and stopping at a limit (100 unless given), in the given zone when the schedule names none (UTC by default), as the tick does. An unknown zone throws a `CronError`. A trigger that is not a schedule has none.

The old `occurrences` used the machine's zone for a schedule without one. It changed so that the times listed are the times the tick starts.

## Examples

- Given `0 * * * *` in UTC, 08:30 and 11:00, when the times are listed, then they are 09:00, 10:00 and 11:00.
- Given `0 9 * * *` without a zone, Asia/Tokyo as the given zone, and 2026-11-03 10:00 to 2026-11-04 10:00 UTC, when the times are listed, then the only one is 2026-11-04 00:00 UTC.
- Given an `every` trigger, when the times are listed, then the list is empty.
