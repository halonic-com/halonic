# app.routine-list

- Status: active
- Since: 0.1.0
- Source: HAL-4844, HAL-187 item 7; the list `halonic routines` shows

The routine list shall return every routine file of a workspace that parsed, in the order of the files' paths, each with its key, hub, id, name and whether it is on, its trigger in the words of `describeTrigger`, the time it next runs on its own after the time given, and the newest real run it started. A schedule without a time zone shall be read in the zone given. A routine that is off, or whose trigger isn't a clock, shall have no next run. A routine whose schedule doesn't parse shall have no next run and still be listed, without failing the list. Test runs shall never count as a routine's last run.

## Examples

- Given a routine with the schedule `0 9 * * 1` and no time zone, on Wednesday 11 Nov 2026 at 10:00 UTC with the zone `Europe/Amsterdam`,
  when the routines are listed,
  then its trigger is "Mondays at 09:00" and its next run is Monday 16 Nov at 08:00 UTC.
- Given a routine that runs every 15 minutes but is off, and a manual routine,
  when the routines are listed,
  then neither has a next run.
- Given two runs a routine started and a run of another workflow,
  when the routines are listed,
  then the routine's last run is the newer of its two runs, and a routine that started none has no last run.
- Given a test run whose trigger names a routine,
  when the routines are listed,
  then it is not that routine's last run.
- Given a routine whose schedule is `61 * * * *`,
  when the routines are listed,
  then it is listed with no next run, and the routines after it are listed too.
