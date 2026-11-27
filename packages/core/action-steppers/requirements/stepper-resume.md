# action-steppers.stepper-resume

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, section 6.3; HAL-20265 (resume after a kept sign-in key, Julian's review of #6694)

When the user resumes a stopped stepper, the action-steppers package shall skip every step recorded as succeeded or skipped, ask every `input` step again, run a failed `guided` step again, and stop at a failed API step instead of repeating it, naming the step and the service's page. A sign-in with any part left shall run again from its first part, unless its `keep` part is recorded and it isn't a test sign-in: then only the parts left shall run, so no second key is made.

## Examples

- Given an `input` step that succeeded and a `guided` step that failed,
  when the user resumes,
  then the stepper asks the input again and reopens the guided step.
- Given a failed API step,
  when the user resumes,
  then the stepper stops at that step and links the service's page for it.
- Given a sign-in that isn't a test, whose first three parts are recorded,
  when the user resumes,
  then only its test part runs.
