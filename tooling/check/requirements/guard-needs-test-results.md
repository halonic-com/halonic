# check.guard-needs-test-results

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3)

If a package with tests has no readable result file in the merge base or in the pull request, then the requirement guard shall report it, so it never passes a comparison it couldn't make.

## Examples

- Given a package with tests whose merge-base checkout has no `test-results/vitest.json`,
  when the guard runs,
  then it reports that the merge base's result file is missing, and a decision note doesn't change that.
