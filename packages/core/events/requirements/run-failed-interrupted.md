# events.run-failed-interrupted

- Status: active
- Since: 0.1.0
- Source: [HAL-1668 failure-path decisions](/HAL/issues/HAL-1668#document-decisions); task HAL-1728

The events package shall let a `run.failed` event give the reason `interrupted` when the engine stopped while the run was going (a crash, a shutdown or a restart) and, on its next start, ended the run that had no end event. Runs that were waiting for an event, a timer or a child run are not interrupted: they are meant to outlive a restart.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `interrupted`.
- Given a `run.failed` event with `reason: "interrupted"`,
  when its type is checked,
  then it is a valid run event.
