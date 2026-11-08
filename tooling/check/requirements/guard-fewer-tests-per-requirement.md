# check.guard-fewer-tests-per-requirement

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3, point 3)

If fewer tests run for a requirement in a pull request than on the merge base, then the requirement guard shall report it under the requirement's ID, even when the total number of tests stays the same.

## Examples

- Given two tests that ran for `workflow.timer-fires` on the merge base,
  when the pull request moves one of them to another requirement,
  then the guard reports that 1 test ran for `workflow.timer-fires`, 2 on the merge base.
- Given a test of `workflow.timer-fires` that is skipped in the pull request,
  when the guard compares the runs,
  then the skipped test doesn't count as run.
