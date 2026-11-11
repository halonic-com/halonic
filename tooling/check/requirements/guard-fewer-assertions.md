# check.guard-fewer-assertions

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3, point 3)

If a requirement's tests make fewer `expect` calls in a pull request than on the merge base, and the pull request changes a file in the package that owns its tests or changes its requirement file, then the requirement guard shall report it under the requirement's ID. When one of the requirement's test files retries with `vi.waitFor`, the guard reports the drop only if the pull request changes one of its test files.

## Examples

- Given the tests of `workflow.timer-fires` made 3 `expect` calls on the merge base,
  when they make 2 in the pull request,
  then the guard reports 2 calls against 3.
- Given the same drop in `expect` calls and the pull request edits a helper in the same package, but not the test file,
  then the guard reports 2 calls against 3, because the helper can assert less.
- Given the same drop in `expect` calls but nothing in the package and no requirement file of `workflow.timer-fires` changed,
  then the guard reports nothing, because the count varies from run to run.
- Given the same drop in `expect` calls, a changed file in the package, and a test file of `workflow.timer-fires` that calls `vi.waitFor`,
  when the pull request doesn't change that requirement's test files,
  then the guard reports nothing, because `vi.waitFor` runs its `expect` calls again until they pass, so the count depends on the runner's speed.
- Given the same, but the pull request changes one of that requirement's test files,
  then the guard reports 2 calls against 3.
