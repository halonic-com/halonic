# action-steppers.expect-stop

- Status: active
- Since: unreleased
- Source: HAL-20233, a follow-up from the security review of #6708 on HAL-20229; architecture note on HAL-17491, sections 2.3 and 6.2; requirement `action-steppers.expect-check`

When a request's `check` step has succeeded and what it kept differs from the request's `expect`, the stepper shall send none of the later steps, end the request as failed with the next step failed as `state-changed`, and show "This changed since the request: …" with each changed value's requested and current values shown apart from that sentence. Once a `check` step has succeeded, each step's line shall show the definition's preview with the values the check kept.

## Examples

- Given a request to set 2 required reviews on `main` of `acme/app` that expects 2,
  when **Run all** runs and the check reads 1,
  then only the `GET` is sent, never the `PATCH`, and the stepper shows `This changed since the request: "required_approving_review_count".`
- Given the same request expecting 1,
  when the check reads 1,
  then both steps are sent.
- Given the check read 1 required review,
  when the request shows,
  then step 2's line reads "Required reviews on `main` today: 1. After: 2."
