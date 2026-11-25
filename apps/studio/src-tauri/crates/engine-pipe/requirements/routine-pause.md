# studio.src-tauri.crates.engine-pipe.routine-pause

- Status: draft
- Since: unreleased
- Source: HAL-17177; Pause routines in the tray (B1, HAL-14206), approved by the maintainer on HAL-14220 with these conditions

The shell shall keep the user's Pause routines for each workspace in memory only, so that after a full Quit the next start isn't paused, and shall send the engine `pause_routines` with the kept state after each of its handshakes, also when the engine started again after a crash, and whenever the user pauses or resumes. The shell shall read `paused` in every `health` frame, and if a `health` frame has no `paused`, or one that isn't `true` or `false`, then the shell shall treat it as a fault.

## Examples

- Given a workspace the user paused, whose engine crashed and started again,
  when the new engine's handshake comes,
  then the shell sends `{"kind":"pause_routines","paused":true}`.
- Given a shell started after a full Quit,
  when the engine's handshake comes,
  then the shell sends `{"kind":"pause_routines","paused":false}`.
- Given a `health` frame without `paused`,
  when the shell reads it,
  then it is a fault.
