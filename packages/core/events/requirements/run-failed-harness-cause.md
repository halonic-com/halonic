# events.run-failed-harness-cause

- Status: active
- Since: 0.1.0
- Source: HAL-10967 (Liam's review of halonic#3145, HAL-10961 and HAL-10965); cli-output 3.4 known-cause rows, HAL-2264 P1 as added on HAL-2361

The events package shall let a `run.failed` event with the reason `harness-start-failed` say why the harness program didn't start, in an optional `harnessCause`, when the engine knows: `not-installed` when the program isn't on this computer, `signed-out` when it is installed but no one is signed in to it for the agent. When the engine doesn't know, `harnessCause` is absent. It is set only with this reason. A reader that doesn't know a cause reads it as absent, and still shows the plain "didn't start" line. Logs written before the field existed read as before.

## Examples

- Given the cause type,
  when it is listed,
  then it is exactly `not-installed` and `signed-out`.
- Given a `run.failed` event with `reason: "harness-start-failed"` and `harnessCause: "signed-out"`,
  when its type is checked,
  then it is a valid run event.
- Given a `run.failed` event with `reason: "harness-start-failed"` and no `harnessCause`,
  when its type is checked,
  then it is a valid run event.
