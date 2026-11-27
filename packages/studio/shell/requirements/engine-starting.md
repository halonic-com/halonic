# shell.engine-starting

- Status: active
- Since: unreleased
- Source: HAL-19965 (step 4 of the plan on HAL-19531, Liam's approval there); the wording from HAL-19613

When the app hands `shell.engine.startingUntil` the open of a workspace's engine, the shell shall send `engine.connection { state: "starting" }`, and send `engine.connection { state: "connected" }` once that open settles, whether it succeeded or failed. When the app hands it a newer open before the older one settled, only the newer one shall end the `starting` state. While the shell follows an executor or supervises an engine, `startingUntil` shall change nothing. Neither change shall be announced. While the engine is `starting` and not stale, the frame's engine line shall read "Starting the engine…", with the info mark, and the line shall go once the engine is `connected`.

## Examples

- Given a desktop window whose workspace shows while its engine starts,
  then the line at the top of the panel reads "Starting the engine…".
- Given the same line,
  when the engine's open settles,
  then the line is gone.
- Given a window that opened "acme" and then "globex" while the engine starts,
  when the open for "acme" settles first,
  then the line still reads "Starting the engine…" until the open for "globex" settles.
