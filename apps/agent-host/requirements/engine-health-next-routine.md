# agent-host.engine-health-next-routine

- Status: active
- Since: unreleased
- Source: HAL-18279; the tray's status lines in the board-approved tray menu (HAL-14213), B1 (HAL-14206)

The engine role shall report in every `health` frame `runsWaiting`, the number of its going runs (counted in `activeRuns`) that wait for someone's answer, and `nextRoutineAt`, when the earliest routine that is on is next due to start on its own, as `Date.toISOString()` writes it, or `null` when no routine is. After each routine tick, paused or not, the engine role shall count the runs again; after each tick that isn't paused it shall read `nextRoutineAt` again. While routines are paused, before the first tick that isn't, and once a stop began, `nextRoutineAt` shall be `null`. A routine that is off, has no clock or whose schedule doesn't parse shall not count for `nextRoutineAt`, and shall not keep the other routines from counting.

## Examples

- Given an engine with a routine on `0 14 * * *` and one run waiting for an approval out of 2 going,
  when a routine tick at 09:00 UTC comes,
  then its health says `"activeRuns":2,"runsWaiting":1,"nextRoutineAt":"2026-11-25T14:00:00.000Z"`.
- Given an engine the shell paused,
  when a routine tick comes,
  then its health says `"nextRoutineAt":null` and counts the runs going.
- Given a routine whose schedule doesn't parse and one on `every: 1h`,
  when the engine reads the next routine at 09:20,
  then it says 10:00.
