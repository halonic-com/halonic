# events.run-failed-this-computer-start-failed

- Status: active
- Since: unreleased
- Source: task HAL-13090

The events package shall let a `run.failed` event give the reason `this-computer-start-failed` when a person set the step's agent to run on this computer, without a sandbox, and the launcher that starts it there did not open. It is a different reason from `sandbox-start-failed`: there is no sandbox in such a run, so no screen may say a sandbox failed.

The event's `error` shall then be the launcher's own reason, as the engine logged it, so the CLI and Studio can say what failed.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `this-computer-start-failed`.
- Given a `run.failed` event with `reason: "this-computer-start-failed"`,
  when its type is checked,
  then it is a valid run event.
