# agent-host.engine-routine-pause

- Status: active
- Since: unreleased
- Source: HAL-17177; Pause routines in the tray (B1, HAL-14206), approved by the maintainer on HAL-14220 with these conditions

When the engine role opens, it shall start no routine run and store no routine tick until the shell's first `pause_routines`. When the shell sends `pause_routines` with `paused: true`, the engine role shall start no routine run, and each routine tick shall store its time as the last tick, so the times that fall due while paused are skipped, not caught up after the resume. When the shell sends `pause_routines` with `paused: false`, the engine role shall tick routines as usual from its next tick. The engine role shall report `paused` in every `health` frame: `true` while paused or before the shell's first `pause_routines`. If a `pause_routines` frame has any field but `kind` and `paused`, or a `paused` that isn't `true` or `false`, then the engine role shall treat it as a fault of the control pipe.

## Examples

- Given an open engine that has had no `pause_routines`,
  when a routine tick comes,
  then no run starts, no tick is stored, and its health says `"paused":true`.
- Given an engine the shell paused,
  when two routine ticks come and then the shell sends `{"kind":"pause_routines","paused":false}`,
  then the two ticks only passed, and the next tick ticks the scheduler.
- Given the frame `{"kind":"pause_routines","paused":"yes"}`,
  when the engine reads it,
  then it reports a fault and pauses nothing.
