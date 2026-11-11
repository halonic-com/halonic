# app.scheduler-keeps-last-enabled-when-unreadable

- Status: active
- Since: 0.1.0
- Source: engine answer point 4 (HAL-3267); flow-routines rev 20, section 7; stub `app.scheduler.keeps-last-enabled-when-unreadable` in req-core-routines (HAL-3246)

If a live routine's saved file doesn't parse, then `LiveRoutines` shall keep the last `enabled` it read from that file, or take the live version's `enabled` when it hasn't read one yet, so a half-typed file never turns a routine on or off.

## Examples

- Given "morning" read as off, when its saved file becomes half-typed YAML, then it stays off; when the file reads as on again, then it is on.
- Given "morning" off in its live version and a saved file that never parsed since the workspace opened, then it is off.
