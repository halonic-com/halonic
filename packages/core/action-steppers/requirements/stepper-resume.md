# action-steppers.stepper-resume

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, section 6.3

When the user resumes a stopped stepper, the action-steppers package shall skip every step recorded as succeeded or skipped, ask every `input` step again, run a failed `guided` step again, and stop at a failed API step instead of repeating it, naming the step and the service's page.

## Examples

- Given an `input` step that succeeded and a `guided` step that failed,
  when the user resumes,
  then the stepper asks the input again and reopens the guided step.
- Given a failed API step,
  when the user resumes,
  then the stepper stops at that step and links the service's page for it.
