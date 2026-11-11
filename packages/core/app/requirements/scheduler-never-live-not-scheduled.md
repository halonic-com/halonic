# app.scheduler-never-live-not-scheduled

- Status: active
- Since: 0.1.0
- Source: engine answer point 4 (HAL-3267); flow-routines rev 20, 3.2 notice 1; stub `app.scheduler.never-live-not-scheduled` in req-core-routines (HAL-3246)

If a routine has never been in a version, then `LiveRoutines` shall leave it out of the routine scheduler's list, and shall not fall back to its saved file.

## Examples

- Given routine "evening" saved and turned on but never in a version, then it isn't in the list, so nothing starts and nothing is skipped at its time.
- Given a workspace with history but no version yet, then the list is empty.
