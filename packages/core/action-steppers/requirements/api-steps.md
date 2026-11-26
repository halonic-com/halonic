# action-steppers.api-steps

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 2.3, 2.4 and 6.3; plan approved on HAL-20151; task HAL-17518

Where a stepper definition has a `call` step (a method other than `GET`, a path template, body fields and the answer fields to keep) or a `check` step (a read-only path template and the answer fields to keep), the action-steppers package shall require a `manual: { url, instructions }` form on it, show that form in the manual guide as it shows a `script` step's, and stop at it when it failed instead of repeating it on resume. `routesOf` shall give each `guided`, `call` and `check` step the route the shell's list holds, filling every placeholder's and every parameter body field's pattern from the definition's parameter of the same name, and giving a `check` the method `GET`, no body and the risk `routine`; it shall throw for a placeholder or body field that isn't a parameter, for a placeholder whose parameter is optional, and for a text pattern with the `i` flag.

## Examples

- Given a definition for `acme/app` with a `check` on `/repos/{owner}/{repo}/environments/{environment}` and a `PUT` `call` on the same path with the parameter field `wait_timer`,
  when its routes are built,
  then step 1 is a `routine` `GET` with no body, step 2 is a `PUT` with `wait_timer` as an integer field, and both have the patterns of `owner`, `repo` and `environment`.
- Given a `call` whose path names `{branch}` when no parameter has that name,
  when its routes are built,
  then it throws, naming the definition, the step and `{branch}`.
- Given a failed `check` step,
  when the user resumes,
  then the stepper stops at it and links its manual form's page.
