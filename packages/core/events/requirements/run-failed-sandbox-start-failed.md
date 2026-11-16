# events.run-failed-sandbox-start-failed

- Status: active
- Since: 0.1.0
- Source: HAL-1668 failure-path decisions; task HAL-1728; `sandboxReason` from HAL-10967

The events package shall let a `run.failed` event give the reason `sandbox-start-failed` when the sandbox check had passed but the sandbox did not start for this run. It is a different reason from a sandbox that is not ready, where the check itself failed and no run could start in a sandbox.

When the sandbox check no longer passes once the sandbox failed to open, the event shall also give the check's reason code in the optional `sandboxReason`, the same code `sandbox-not-ready` gives, so the CLI and Studio can say why. When the check still passes, or gives no code, `sandboxReason` is absent, and logs written before the field existed read as before.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `sandbox-start-failed`.
- Given a `run.failed` event with `reason: "sandbox-start-failed"`,
  when its type is checked,
  then it is a valid run event.
- Given a `run.failed` event with `reason: "sandbox-start-failed"` and `sandboxReason: "bubblewrap-missing"`,
  when its type is checked,
  then it is a valid run event.
