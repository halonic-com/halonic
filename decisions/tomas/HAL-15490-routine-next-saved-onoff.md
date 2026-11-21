# Decision: Studio's routine Next takes On or Off from the saved file

- Task: HAL-15490
- Approval: Liam approves this change on HAL-15490 (https://paperclip.halonic.com/HAL/issues/HAL-15490), for HAL-15490. A team decision with no board card (HAL-2282 rule): it makes Studio say what the scheduler already does.
- Kind: user-visible

## What changes

While a routine's saved file isn't live yet, Studio built its Next times, summary and rows from
the live version whole, `enabled` included. The scheduler (`app.scheduler-live-routines`) takes
On or Off from the saved file at once, because Off must never wait for a version. So a routine
turned off in an unversioned change still showed a next time, and one turned on showed none
while the scheduler started it.

Studio now takes the routine as it runs from one core helper, `runningRoutine` in
`@halonicjs/app/routines`, which the CLI's routine list (`app.routine-list-live-schedule`, #4708)
uses too, so the two can't drift.

The requirement `studio.workspace-routines-live-schedule` says the routine is on or off as saved.
Its second example ("live version off, saved file on → no next time") said the opposite of what
the scheduler does; it is replaced by two examples, one each way. The test "gives no next time
while the live version is off" becomes "takes On and Off from the saved file, as the scheduler
does", which checks both directions. No test was weakened or skipped.

## Covers

- studio.workspace-routines-live-schedule
