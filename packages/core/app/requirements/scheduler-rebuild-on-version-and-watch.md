# app.scheduler-rebuild-on-version-and-watch

- Status: active
- Since: 0.1.0
- Source: engine answer point 4 (HAL-3267, HAL-3247); stub `app.scheduler.rebuild-on-version-and-watch` in req-core-routines (HAL-3246)

When the live version moves (a new version, Get updates, a commit from outside) or a routine's saved file changes, `LiveRoutines` shall give the changed list on its next call, so the next tick uses it. It shall read the live version's files once per version.

## Examples

- Given "morning" turned off in its saved file after one call, then the next call has it turned off.
- Given a new version that changes "morning" to `0 7 * * *`, then the next call has it at 07:00.
- Given two calls with no new version, then the live version's files are read once.
