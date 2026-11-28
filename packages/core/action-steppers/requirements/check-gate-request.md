# action-steppers.check-gate-request

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); plan approved by the maintainer on HAL-17522 (27 Nov); task HAL-20270; builds on `action-steppers.check-gate`

When a step is about to run, the action-steppers package shall refuse it if the request's `expect` lacks a field that a `check` step before it names in `requiredExpect`, with "This request leaves out what the agent saw before asking, so Halonic can't check this step. Decline it and ask again." (without the field names), before that check runs; and shall refuse it with the rule's own `reason` if a `requires` rule with `equalsParameter` finds the kept value missing, or different (by `===`) from the request's parameter of that name, or the parameter missing. `routesOf` shall throw for a `requiredExpect` field the check doesn't keep or that isn't a plain name (a request's `expect` takes no dotted name), and for an `equalsParameter` that isn't a parameter.

## Examples

- Given a check on a workflow run that requires the request's `expect` to name `head_sha`,
  when a request without `head_sha` in its `expect` asks for the next step,
  then it is refused with `This request leaves out what the agent saw before asking, so Halonic can't check this step. Decline it and ask again.`
- Given a check that keeps the environment `release` with `id` 161 and requires `id` to equal the parameter `environment_id`,
  when the request's `environment_id` is 162,
  then the next step is refused with the definition's reason, such as `This isn't the environment the request names.`
- Given a check whose `requiredExpect` names `head_sha` but whose `keep` doesn't,
  when its routes are built,
  then it throws, naming the step and `head_sha`.
- Given a check that keeps `environment.id` and names it in `requiredExpect`,
  when its routes are built,
  then it throws, naming the step and `environment.id`.
