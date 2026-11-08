# routines.occurrences

- Status: active
- Since: 0.1.0
- Source: `occurrences` in the old routines package (`packages/core/routines/src/schedule.ts`) at 784f78d

When asked for the times a schedule fires between two moments, the routines package shall list them oldest first, leaving out the start, including the end, and stopping at a limit (100 unless given). A trigger that is not a schedule has none.

## Examples

- Given `0 * * * *` in UTC, 08:30 and 11:00, when the times are listed, then they are 09:00, 10:00 and 11:00.
- Given an `every` trigger, when the times are listed, then the list is empty.
