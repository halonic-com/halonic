# studio.workspace-routines-live-schedule

- Status: active
- Since: unreleased
- Source: HAL-15337 (Sofia's Routines UX check, row RT5); flow-routines 3.11 (the board's save model); `studio.workspace-liveness`; HAL-15490 (On or Off as saved, as `app.scheduler-live-routines` and `app.routine-list-live-schedule` have it)

While a routine's saved file isn't live yet, the desktop app shall build the routine's summary line, its row in the Routines list, its row in a Triggers section and its next times from the routine's live version, which is what the scheduler runs, with whether it is on from the saved file, since turning a routine on or off counts at once, and the page's fields from the saved file. A routine that is live, has never been live, or is in a folder that keeps no history shall have them built from the saved file.

## Examples

- Given `weekly-report` runs Analyst on Mondays at 09:00 in its live version, and its saved file runs it on Mondays and Wednesdays, then its page's summary, its list row and its row in Analyst's Triggers section say "Mondays at 09:00 → Analyst" (the row "Mondays at 09:00"), the next time is Monday 23 November and Next lists only Mondays, while the When field says "Mondays, Wednesdays at 09:00".
- Given the live version is on and the saved file changes its schedule and turns it off, then the routine has no next time.
- Given the live version is off and the saved file turns it on, then the next time follows the live version's schedule.
- Given a routine that has never been live, then its summary and Next follow the saved file.
