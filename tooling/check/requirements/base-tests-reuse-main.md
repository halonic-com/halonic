# check.base-tests-reuse-main

- Status: active
- Since: unreleased
- Source: HAL-17657

When a pull request into main runs CI, the "Merge base's tests (no cache)" job shall take the merge base's test results from a green push or merge-group run of `ci.yml` on main in the same repository for exactly that commit, or else for the newest commit within 20 on main's first-parent history that has one, instead of running any test, and shall never read results from any other run.

## Examples

- Given a merge base whose merge-group run passed and uploaded every shard's test results,
  when the job runs,
  then it unpacks those results, installs nothing, runs no test, and reports the merge base as the tested commit.
- Given runs for the merge base from a pull request, a branch other than main, another repository or another workflow, or a run that failed,
  when the job runs,
  then it reads none of their artifacts and tests the merge base as before.
- Given no usable results for the merge base but a green merge-group run two commits back,
  when the job runs,
  then it uses that run's results, reports that commit as the tested one, and warns `baseline-walked-back`.
- Given an archive holding a link or a file other than `test-results/vitest.json`,
  when the job runs,
  then it unpacks nothing and tests the merge base.
- Given a pull request into a branch other than main,
  when the job runs,
  then it looks up no run and tests the merge base.
