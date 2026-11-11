# check.guard-fewer-assertions

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3, point 3)

If a requirement's tests make fewer `expect` calls in a pull request than on the merge base, and the pull request changes a file in the package that owns its tests or changes its requirement file, then the requirement guard shall report it under the requirement's ID. When one of the requirement's test files imports `vi` and retries with `vi.waitFor`, the guard skips a drop only those retries can explain: the pull request changes none of the requirement's test files, none of its tests drops to 0 calls, and its test files without `vi.waitFor` make as many calls as before.

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
- Given the same, but one test of `workflow.timer-fires` drops from 1 call to 0,
  then the guard reports it, because a retry runs its `expect` calls at least once.
- Given the same, but the drop is in a second test file of `workflow.timer-fires` that doesn't call `vi.waitFor`,
  then the guard reports it, because that file's count doesn't depend on timing.
