# action-steppers.call-target

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); Liam's plan approval on HAL-21135 (28 Nov, 15:17 UTC), option A; Liam's condition 3 on HAL-21185 (28 Nov) for text body fields

Where a stepper definition is `irreversible`, each of its `call` steps shall have a target, the name the user types in the shell's native dialog, and `routesOf` shall write it on the step's route; a `call` step of any other risk shall have none. `routesOf` shall check the target as the shell's route list reads it (`parse_target` in `action-send`'s `target.rs`), with the same wording: text with `{name}` parts, each one of the route's own placeholders or text body fields (a `parameter` body field whose parameter is text or a choice) and at least one of them, with no unclosed `{`, stray `}` or hidden character. It shall throw for any other target, naming the step, so a definition the shell would refuse fails in the catalog's tests and not when the step runs.

## Examples

- Given an `irreversible` definition whose `call` step has the target `{owner}/{repo} run {runId}` over the path `/repos/{owner}/{repo}/actions/runs/{runId}/pending_deployments`,
  when `routesOf` builds its route,
  then the route has that target.
- Given an `irreversible` `call` step with no target, or an `admin` one with a target,
  when `routesOf` builds its routes,
  then it throws "an irreversible call needs a target" or "only an irreversible call has a target".
- Given an `irreversible` `call` step over `/orgs/{owner}/repos` whose body sends the text parameter `repo`,
  when its target is `{owner}/{repo}`,
  then `routesOf` writes it on the route; with an integer or a constant body field in the target, it throws.
- Given a target `{owner}/{repo} run {environment}`, `run {runId`, `{runId}}`, `acme run`, or one with a right-to-left mark,
  when `routesOf` builds its routes,
  then it throws, naming the step and the target.
