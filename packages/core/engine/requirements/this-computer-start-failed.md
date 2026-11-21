# engine.this-computer-start-failed

- Status: active
- Since: unreleased
- Source: task HAL-13090

When a person set a harness run's agent to run on this computer, without a sandbox, and the launcher that starts it there doesn't open, the engine shall fail the step with `this-computer-start-failed`, not `sandbox-start-failed`, and shall not ask a sandbox why, since there is none. The step's error shall be the launcher's own reason: the first line of the launcher's error message, as the launcher wrote it. When that line is empty, the error is not an `Error`, or the line holds anything shaped like a key, the error shall be a fixed text instead, so no value from the environment reaches the run log. Everything the call started shall be stopped, as for `sandbox-start-failed`.

## Examples

- Given an agent placed on this computer, whose launcher's `open` throws "a program started without a fence can't reach a bridge on a Unix socket" followed by a second line,
  when the harness run starts,
  then the run fails with `this-computer-start-failed`, its error is that first line only, the log ends at `sandbox.started`, and the bridge is closed.
- Given an agent placed on this computer, whose launcher's `open` throws a message that holds a key-shaped value,
  when the harness run starts,
  then the run fails with `this-computer-start-failed` and its error is "Halonic can't tell why".
