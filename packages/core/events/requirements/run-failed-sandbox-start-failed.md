# events.run-failed-sandbox-start-failed

- Status: active
- Since: 0.1.0
- Source: [HAL-1668 failure-path decisions](/HAL/issues/HAL-1668#document-decisions); task HAL-1728

The events package shall let a `run.failed` event give the reason `sandbox-start-failed` when the sandbox check had passed but the sandbox did not start for this run. It is a different reason from a sandbox that is not ready, where the check itself failed and no run could start in a sandbox.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `sandbox-start-failed`.
- Given a `run.failed` event with `reason: "sandbox-start-failed"`,
  when its type is checked,
  then it is a valid run event.
