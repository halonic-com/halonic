# studio.workspace-routines-list-liveness

- Status: active
- Since: unreleased
- Source: HAL-15370 (Julian's review of #4602 on HAL-15337); `studio.workspace-routines-live-schedule`

When the desktop app builds the Routines list or a Triggers section, it shall read the folder's history once for all the routines it shows. When the history or a routine's live version can't be read, the desktop app shall build that list or section from the saved files, as for a folder that keeps no history, and only the routine's page shall fail with the reason.

## Examples

- Given a hub with the routines `weekly-report` and `daily-digest`, when the Routines list or Analyst's Triggers section is built, then the history is read once, not once per routine.
- Given the history can't be read, then the Routines list and Analyst's Triggers section show `weekly-report` as saved, with its next time, while its page fails with the reason.
