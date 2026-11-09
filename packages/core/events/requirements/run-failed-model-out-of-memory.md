# events.run-failed-model-out-of-memory

- Status: active
- Since: 0.1.0
- Source: [HAL-1668 failure-path decisions](/HAL/issues/HAL-1668#document-decisions); task HAL-1728

The events package shall let a `run.failed` event give the reason `model-out-of-memory` when the machine running the model had too little memory to load it or to answer, so a person learns to pick a smaller model or free memory, not to retry. The `error` text stays the message to show; the provider's own text goes to the log, not into the event.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `model-out-of-memory`.
- Given a `run.failed` event with `reason: "model-out-of-memory"`,
  when its type is checked,
  then it is a valid run event.
