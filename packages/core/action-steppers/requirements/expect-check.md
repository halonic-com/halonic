# action-steppers.expect-check

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, section 6.2

When a `check` step reads a state that differs from the request's `expect`, the action-steppers package shall stop the stepper with "This changed since the request: …", naming each value that changed.

## Examples

- Given a request that expects head commit `abc1234`,
  when the check reads head commit `def5678`,
  then the stepper stops with "This changed since the request: headSha was abc1234, is now def5678."
