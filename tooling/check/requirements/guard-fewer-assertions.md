# check.guard-fewer-assertions

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3, point 3)

If a requirement's tests make fewer `expect` calls in a pull request than on the merge base, then the requirement guard shall report it under the requirement's ID.

## Examples

- Given the tests of `workflow.timer-fires` made 3 `expect` calls on the merge base,
  when they make 2 in the pull request,
  then the guard reports 2 calls against 3.
