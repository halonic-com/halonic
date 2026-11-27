# shell.engine-starting

- Status: active
- Since: unreleased
- Source: HAL-19965 (step 4 of the plan on HAL-19531, Liam's approval there); the wording from HAL-19613

When the app opens a `StudioWorkspace` with `engineReady`, the open of that workspace's engine, the workspace's `engineStarting` shall say it starts until that open settles, whether it succeeded or failed. Without `engineReady` it shall not say it starts. The workspace's start shall not change the window's `shell.engine`: no `engine.connection` event shall be sent, it shall not make the engine stale, and nothing shall be announced. While the shown workspace's engine starts and the window's engine is not stale, the frame's engine line shall read "Starting the engine…", with the info mark, and the line shall go once that engine has started. A workspace whose engine has started shall show no such line, while another workspace's engine still starts.

## Examples

- Given a desktop window whose workspace shows while its engine starts,
  then the line at the top of the panel reads "Starting the engine…".
- Given the same line,
  when the engine's open settles,
  then the line is gone.
- Given a window with "acme" open, whose engine answers,
  when "globex" opens and its engine starts,
  then the window's engine stays connected, and "acme" shows no "Starting the engine…" line.
