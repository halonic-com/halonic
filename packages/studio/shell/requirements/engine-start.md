# shell.engine-start

- Status: active
- Since: 0.1.0
- Source: HAL-1668 (FS2, FS3), HAL-1729

The shell shall start the engine process with the launcher the app hands to `shell.engine.supervise` and send `engine.connection { state: "starting", attempt, since }` before any time passes. When the engine answers, the shell shall send `connected`. If the engine doesn't answer within 30 s, then the shell shall stop it and send `failed` with the reason `no-answer`. If the engine stops before it answers, then the shell shall send `failed` with the reason `stopped-while-starting` and the exit code. If the engine reports that it can't write its data folder, then the shell shall stop it and send `failed` with the reason `data-folder-not-writable`. When a running engine stops, the shell shall send `lost` and start it again 2 s later as attempt 2, with the last exit code. If the engine stops again within 60 s of that restart, then the shell shall send `failed` with the reason `stopped-while-starting` and not start it again. The shell shall not start the engine again after a failure until `retry` is called, which starts from attempt 1. If a listener throws, then the shell shall still finish the step and throw the error afterwards. If the shell is asked to supervise an engine while it follows an executor or an engine, then the shell shall throw a `ShellError`.

## Examples

- Given the shell supervises an engine that answers after 1.2 s,
  when the engine starts,
  then listeners get `starting` (attempt 1) at once and `connected` when it answers, and nothing is announced.
- Given an engine that is starting,
  when 30 s pass without an answer,
  then the process is stopped and listeners get `failed` with `no-answer`.
- Given an engine that has run for 5 minutes,
  when it stops with exit code 137,
  then listeners get `lost`, the loss is announced, and 2 s later `starting` with attempt 2 and last exit code 137.
- Given an engine that was restarted 59 s ago,
  when it stops again,
  then listeners get `failed` with `stopped-while-starting`, and no third process is started.
