# app.scheduler-live-routines

- Status: active
- Since: 0.1.0
- Source: engine answer point 4 (HAL-3267); flow-routines rev 20, section 7; stub `app.scheduler.reads-routine-from-live-version` in req-core-routines (HAL-3246)

When the routine scheduler builds its list of routines, `LiveRoutines` shall read each routine's trigger, target, input and rules from the live version, and take `enabled`, and whether the routine is there at all, from the saved file at the same path. A routine whose saved file isn't there shall not be in the list. In a workspace without history, it shall read every routine from the saved files.

## Examples

- Given routine "morning" live with `schedule: "0 8 * * *"` and saved with `schedule: "0 9 * * *"`, then the list has "morning" at 08:00.
- Given "morning" live with `enabled: true` and saved with `enabled: false`, then it is in the list turned off.
- Given "morning" live with `enabled: false` and saved with `enabled: true`, then it is in the list turned on, with the live version's schedule.
- Given "morning" live but its saved file deleted (in the trash, or from a terminal), then it isn't in the list.
- Given a workspace with history off, then the list holds the saved routines.
