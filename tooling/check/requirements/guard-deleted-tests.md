# check.guard-deleted-tests

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3, point 3)

If a pull request deletes a test file, or fewer tests run in a test file than on the merge base, then the requirement guard shall report it under the test file's path.

## Examples

- Given `src/timer.test.ts` on the merge base,
  when the pull request deletes it,
  then the guard reports that the test file was deleted.
- Given two tests that ran in `src/timer.test.ts` on the merge base,
  when only one runs in the pull request,
  then the guard reports that 1 test ran there, 2 on the merge base.
