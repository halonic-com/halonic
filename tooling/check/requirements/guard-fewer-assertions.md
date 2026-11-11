# check.guard-fewer-assertions

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3, point 3)

If a requirement's tests make fewer `expect` calls in a pull request than on the merge base, and the pull request changes a file in the package that owns its tests or changes its requirement file, then the requirement guard shall report it under the requirement's ID.

## Examples

- Given the tests of `workflow.timer-fires` made 3 `expect` calls on the merge base,
  when they make 2 in the pull request,
  then the guard reports 2 calls against 3.
- Given the same drop in `expect` calls and the pull request edits a helper in the same package, but not the test file,
  then the guard reports 2 calls against 3, because the helper can assert less.
- Given the same drop in `expect` calls but nothing in the package and no requirement file of `workflow.timer-fires` changed,
  then the guard reports nothing, because the count varies from run to run.
