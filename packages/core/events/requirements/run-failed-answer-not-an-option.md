# events.run-failed-answer-not-an-option

- Status: active
- Since: 0.1.0
- Source: [HAL-3375](/HAL/issues/HAL-3375) (Elena's decision); task HAL-3379

The events package shall let a `run.failed` event give the reason `answer-not-an-option` when the agent's output is a `choice` and its answer was not one of the options.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `answer-not-an-option`.
- Given a `run.failed` event with `reason: "answer-not-an-option"`,
  when its type is checked,
  then it is a valid run event.
