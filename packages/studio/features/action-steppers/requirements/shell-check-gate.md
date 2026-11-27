# action-steppers.shell-check-gate

- Status: draft
- Since: unreleased
- Source: plan approved on HAL-20236 (approvals stream HAL-17488); architecture note on HAL-17491, section 6.2

While Studio runs as the desktop app, the stepper shall send a step only after the `check` steps before it have run. When a check kept a value that breaks one of the definition's `requires` rules, the stepper shall send none of the later steps and stop the request the way a changed `expect` stops it (`action-steppers.expect-stop`), with the rule's own `reason` and never the value the service sent; a request opened again shall stop the same way.

## Examples

- Given an `acme/app` request to remove runner 7, whose check requires `status` to be `offline`,
  when the check reads `status` `online`,
  then the removal is not sent, the stepper says "The runner is still online. Stop it first.", and the request ends as failed.
- Given the same request, before its check has run,
  when the user runs step 2,
  then nothing is sent.
- Given the same request, when the check reads `status` `offline`,
  then the removal is sent.
