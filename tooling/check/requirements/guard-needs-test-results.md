# check.guard-needs-test-results

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3), HAL-12539

If a package with tests has no readable result file in the merge base or in the pull request, then the requirement guard shall report it, so it never passes a comparison it couldn't make. When only the packages a pull request affects were tested (`--affected-base`), the guard shall work that set out itself with `affected-tests`, leave the other packages out on both sides, and still report an affected package without a readable result file.

## Examples

- Given a package with tests whose merge-base checkout has no `test-results/vitest.json`,
  when the guard runs,
  then it reports that the merge base's result file is missing, and a decision note doesn't change that.
- Given only the packages the pull request affects were tested,
  when a package it doesn't affect has no result file on one side,
  then the guard leaves that package out on both sides, and still reports a deleted test file in it.
- Given only the packages the pull request affects were tested,
  when an affected package has no result file,
  then the guard reports it.
