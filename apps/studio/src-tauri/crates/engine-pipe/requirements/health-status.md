# studio.src-tauri.crates.engine-pipe.health-status

- Status: draft
- Since: unreleased
- Source: HAL-18279; the tray's status lines in the board-approved tray menu (HAL-14213), B1 (HAL-14206)

The shell shall read `runsWaiting` and `nextRoutineAt` in every `health` frame, beside its other fields. If a `health` frame has no `runsWaiting` or no `nextRoutineAt`, a field it doesn't have, a `runsWaiting` above its `activeRuns`, or a `nextRoutineAt` that is neither `null` nor a UTC time in the form `2026-11-25T14:00:00.000Z`, then the shell shall treat it as a fault.

## Examples

- Given a `health` frame with `"activeRuns":2,"runsWaiting":1,"nextRoutineAt":"2026-11-25T14:00:00.000Z"`,
  when the shell reads it,
  then the engine's health says 2 runs going, 1 waiting, and the next routine at that time.
- Given a `health` frame with `"nextRoutineAt":"14:00"`,
  when the shell reads it,
  then it is a fault.
- Given a `health` frame with an extra field `"runsQueued":0`,
  when the shell reads it,
  then it is a fault.
