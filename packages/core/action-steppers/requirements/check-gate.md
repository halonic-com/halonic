# action-steppers.check-gate

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); plan on HAL-20236; architecture note on HAL-17491, section 6.2

When a step is about to run, the action-steppers package shall refuse it if a `check` step before it has not run, when that check kept a value that differs from the request's `expect`, or when that check kept a value that breaks one of the definition's `requires` rules; a broken `requires` rule shall stop the stepper with the rule's own `reason`, and never with the value the service sent.

## Examples

- Given a definition whose check keeps a runner's `status` and requires it to be `offline`,
  when the check kept `status` `online`,
  then the next step is refused with the definition's reason, such as `The runner is still online. Stop it first.`
- Given a request that expects head commit `abc1234`,
  when the check before the change kept head commit `def5678`,
  then the change is refused with `This changed since the request: "headSha".`
- Given a check with a `requires` rule that hasn't run yet,
  when the step after it is asked to run,
  then it is refused with `Run the check before this step first.`
- Given a check with no `requires` rule and no `expect` value it keeps,
  when the step after it runs,
  then nothing is refused.
