# events.run-failed-sandbox-not-ready

- Status: active
- Since: 0.1.0
- Source: HAL-1782 (P9); task HAL-1709; `agent` added on HAL-11436; `onHold` added on HAL-16624

The events package shall let a `run.failed` event give the reason `sandbox-not-ready` when the sandbox check failed, so a step that needs the sandbox didn't start and nothing ran in it. It shall name why in an optional `sandboxReason`: the `Sandbox` port's reason code, such as `bubblewrap-missing`, never the check's own sentence. `sandboxReason` is set with this reason, and with `sandbox-start-failed` when the check no longer passes once the sandbox failed to open (see `events.run-failed-sandbox-start-failed`), and with no other reason. A reader that doesn't know the code reads it as `other`. It is a different reason from `sandbox-start-failed`, where the check passed but the sandbox didn't open for this run. With `sandbox-not-ready` it also names the agent that didn't start in the optional `agent`, because several agents can start in parallel and the last one started is not always the one refused. With `sandbox-not-ready` it shall say `onHold: true` when a person chose this computer for an earlier version of that agent's file, so the choice waits for them to confirm it again and a reader can tell that from a sandbox to fix; `onHold` is set with no other reason. Logs written before these fields existed read as before.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `sandbox-not-ready`.
- Given a `run.failed` event with `reason: "sandbox-not-ready"` and `sandboxReason: "bubblewrap-missing"`,
  when its type is checked,
  then it is a valid run event.
- Given a `run.failed` event with `reason: "sandbox-not-ready"`, a `sandboxReason` and an `agent`,
  when its type is checked,
  then it is a valid run event.
- Given a `run.failed` event with `reason: "sandbox-not-ready"`, a `sandboxReason`, an `agent` and `onHold: true`,
  when its type is checked,
  then it is a valid run event.
