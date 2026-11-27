# action-steppers.list-body-field

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); plan approved by the maintainer on HAL-17522 (27 Nov); task HAL-20270

Where a stepper definition's `call` step has a `parameter-list` body field naming an integer parameter, the action-steppers package shall give that field the kind `integer-list` in the step's route, so the page sends the parameter as a one-item list under the field's own name and the shell accepts it as a list of integers (up to its own item limit), and `routesOf` shall throw when the named parameter isn't a parameter or isn't an integer.

## Examples

- Given a `POST` `call` with the body field `environment_ids` listing the integer parameter `environment_id`,
  when its routes are built,
  then the route's body holds `environment_ids` as an `integer-list` field.
- Given a list field naming the text parameter `repo`,
  when its routes are built,
  then it throws, naming the step, the field and `{repo}`.
