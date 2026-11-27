# action-steppers.check-gate

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); plan on HAL-20236; architecture note on HAL-17491, section 6.2

When a step is about to run, the action-steppers package shall refuse it if a `check` step before it that has a `requires` rule, or keeps a value the request's `expect` names, has not run; if that check kept a value that differs from the request's `expect`; or if that check didn't read a field one of the definition's `requires` rules names, or read a value that breaks the rule. A broken `requires` rule shall stop the stepper with the rule's own `reason`, a field the check didn't read with Halonic's own sentence naming that field, and never with the value the service sent.

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
- Given a definition whose check requires a runner's `status` to be `offline`,
  when the check was marked done by hand and kept nothing,
  then the next step is refused with `The check didn't read "status".`
- Given a check with no `requires` rule and no `expect` value it keeps,
  when the step after it runs,
  then nothing is refused.
