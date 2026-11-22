# app.routine-list-live-schedule

- Status: active
- Since: unreleased
- Source: HAL-15479 (C581 on HAL-15468, the CLI side of RT5); `studio.workspace-routines-live-schedule`; `app.scheduler-live-routines`

When the routines are listed with a live version, the routine list shall list a routine whose saved file isn't live yet as the routine scheduler runs it: its trigger in words, its next run and its schedule's time zone from the routine's live version, and its name and whether it is on from its saved file, since turning a routine on or off counts at once. A routine that is live, has never been live, or is in a workspace that keeps no history, and every routine when no live version is given, shall be listed from its saved file.

## Examples

- Given `weekly` with the schedule `0 9 * * 1` in the live version, and its saved file changed to `0 9 * * 0`, on Wednesday 11 Nov 2026 with the zone `Europe/Amsterdam`,
  when the routines are listed with the live version,
  then its trigger is "Mondays at 09:00" and its next run is Monday 16 Nov at 08:00 UTC.
- Given that `weekly` changed to `0 9 * * 0` and turned off in its saved file,
  when the routines are listed with the live version,
  then it is off, with no next run.
- Given a routine whose saved file is in no version yet,
  when the routines are listed with the live version,
  then its trigger and next run follow its saved file.
