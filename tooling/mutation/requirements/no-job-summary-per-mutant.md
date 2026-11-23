# mutation.no-job-summary-per-mutant

- Status: active
- Since: unreleased
- Source: HAL-16841

While the mutation runner runs Stryker on a package, it shall set `GITHUB_STEP_SUMMARY` to an empty value in the run's environment, so the tests Stryker runs once per mutant write no GitHub job summary and the job summary holds only the runner's score table.

## Examples

- Given a CI job whose `GITHUB_STEP_SUMMARY` names a file, then the Stryker run's environment has `GITHUB_STEP_SUMMARY` set to an empty value.
