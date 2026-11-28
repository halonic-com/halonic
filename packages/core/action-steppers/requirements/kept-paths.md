# action-steppers.kept-paths

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); Liam's plan approval on HAL-17522 (27 Nov, 01:03 UTC), PR B; task HAL-20271

Where a stepper definition's `call` or `check` step keeps an answer field, the action-steppers package shall accept as its name a plain name (a letter, then letters, digits or `_`, at most 64 characters) or up to 3 of them joined by `.` for a plain value inside objects, such as `triggering_actor.login`, and `routesOf` shall throw for any other name, so a name the shell's route list would refuse fails in the catalog's tests and not when the step runs. No name reaches into a list.

## Examples

- Given a `check` step that keeps `triggering_actor.login`,
  when `routesOf` builds its route,
  then the route keeps `triggering_actor.login`.
- Given a `check` or `call` step that keeps `a.b.c.d`, `pull_requests.0`, `pull_requests[0]` or `x-header`,
  when `routesOf` builds its routes,
  then it throws, naming the step and the field.
