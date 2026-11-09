# events.run-failed-disk-full

- Status: active
- Since: 0.1.0
- Source: [HAL-1668 failure-path decisions](/HAL/issues/HAL-1668#document-decisions); task HAL-1728

The events package shall let a `run.failed` event give the reason `disk-full` when the run could not write what it needed because the disk had no space left.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `disk-full`.
- Given a `run.failed` event with `reason: "disk-full"`,
  when its type is checked,
  then it is a valid run event.
