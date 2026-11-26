# action-steppers.kept-values

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); review of #5659 on task HAL-17517

When a step succeeds and its kept values include a text longer than an action event may hold, the action-steppers package shall cut that text to the event's limit before the stepper builds the step's event, so the event passes its check.

## Examples

- Given a kept text of 1,200 characters,
  when the stepper caps the kept values,
  then the text is cut to 1,000 characters and the `action.step.succeeded` event passes `checkActionEvent`.
