# app.routine-list-live-schedule

- Status: active
- Since: unreleased
- Source: HAL-15479 (C581 on HAL-15468, the CLI side of RT5); a routine never live and the live version's errors, HAL-15664 (C610 #1–2); `studio.workspace-routines-live-schedule`; `app.scheduler-live-routines`; `app.scheduler-never-live-not-scheduled`

When the routines are listed with a live version, the routine list shall list a routine whose saved file isn't live yet as the routine scheduler runs it: its trigger in words, its next run and its schedule's time zone from the routine's live version, and its name and whether it is on from its saved file, since turning a routine on or off counts at once, and its errors from the live version's file, as the scheduler's version has them; the errors of its saved file shall be counted apart. A saved file that doesn't load shall be listed the same way when the live version's file loads. A routine that has never been live shall be listed from its saved file, with no next run, since the scheduler doesn't run it. A routine that is live, or is in a workspace that keeps no history, and every routine when no live version is given, shall be listed from its saved file. Each routine shall say which of these it is: live, not live yet, or never live.

## Examples

- Given `weekly` with the schedule `0 9 * * 1` in the live version, and its saved file changed to `0 9 * * 0`, on Wednesday 11 Nov 2026 with the zone `Europe/Amsterdam`,
  when the routines are listed with the live version,
  then its trigger is "Mondays at 09:00" and its next run is Monday 16 Nov at 08:00 UTC.
- Given that `weekly` changed to `0 9 * * 0` and turned off in its saved file,
  when the routines are listed with the live version,
  then it is off, with no next run.
- Given a routine whose saved file is in no version yet,
  when the routines are listed with the live version,
  then its trigger follows its saved file, it has no next run, and it is never live.
- Given `weekly` starting workflow `report` in the live version, and its saved file changed to start `reprot`, which the hub doesn't have,
  when the routines are listed with the live version,
  then it has no errors, its saved file has 1, and its next run is Monday 16 Nov at 08:00 UTC.
