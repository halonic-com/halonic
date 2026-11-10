# events.run-failed-sandbox-not-ready

- Status: active
- Since: 0.1.0
- Source: [HAL-1782](/HAL/issues/HAL-1782) (P9); task HAL-1709

The events package shall let a `run.failed` event give the reason `sandbox-not-ready` when the sandbox check failed, so a step that needs the sandbox didn't start and nothing ran in it. It shall name why in an optional `sandboxReason`: the `Sandbox` port's reason code, such as `bubblewrap-missing`, never the check's own sentence. `sandboxReason` is set only with this reason. A reader that doesn't know the code reads it as `other`. It is a different reason from `sandbox-start-failed`, where the check passed but the sandbox didn't open for this run. Logs written before the field existed read as before.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `sandbox-not-ready`.
- Given a `run.failed` event with `reason: "sandbox-not-ready"` and `sandboxReason: "bubblewrap-missing"`,
  when its type is checked,
  then it is a valid run event.
