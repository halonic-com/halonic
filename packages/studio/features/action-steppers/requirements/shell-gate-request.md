# action-steppers.shell-gate-request

- Status: draft
- Since: unreleased
- Source: plan approved by the maintainer on HAL-17522 (27 Nov); task HAL-20290 (approvals stream HAL-17488); builds on `action-steppers.shell-check-gate` and the package's `action-steppers.check-gate-request` and `action-steppers.list-body-field`

While Studio runs as the desktop app, the stepper shall stop a request the way a broken `requires` rule stops it (`action-steppers.shell-check-gate`), sending none of the later steps, when the request's `expect` lacks a field a `check` step before the next step names in `requiredExpect`, with "This request doesn't say what the requester saw: …", and when a `requires` rule compares a check's own kept value with one of the request's parameters and they differ, with the rule's `reason`. A request opened again shall stop the same way. For a `call` step's `parameter-list` body field, the stepper shall send the field's parameter as a one-item list under the field's name, and "Show the request" shall show the same body.

## Examples

- Given an `acme/app` request to approve run 42 to the environment 161, whose request has no `expect`,
  when the check on the run has run,
  then the approval is not sent, and the stepper says `This request doesn't say what the requester saw: "head_sha".`
- Given the same request with `expect` `head_sha` `abc123`,
  when the check on the environment keeps `id` 162,
  then the approval is not sent, and the stepper says "This isn't the environment the request names."
- Given the same request, when the environment's check keeps `id` 161,
  then the approval is sent with the body `{ "environment_ids": [161] }`, and "Show the request" shows that body.
