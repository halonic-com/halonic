# check.ci-pr-fail-fast

- Status: active
- Since: unreleased
- Source: HAL-17684 (board decision, HAL-10, 24 Nov)

When a job of a pull request's run of `.github/workflows/ci.yml` fails, the `fail-fast` job shall cancel the run within about a minute and `ci-ok` shall fail with the failed job's name, unless that job is one another workflow re-runs alone once its cause is fixed (`Fast gates`, `Leak guard`, `Coverage floors don't go down`, `Live cloud suites passed`) or the requirement guard's early file checks (`Requirement guard, file checks (merge base's copy)`, `check.ci-guard-files-early`); a merge group's run shall keep cancelling at its first failed job and once its group is gone.

## Examples

- Given a pull request whose `build` job fails while `e2e` still runs,
  when `fail-fast` next reads the run's jobs,
  then it cancels the run, `ci-ok` runs anyway and fails naming `build`, and "Re-run failed jobs" starts `build`, `e2e`, `fail-fast` and `ci-ok` again.
- Given a pull request whose title check in `Fast gates` fails,
  when the rest of the run is still going,
  then the run isn't cancelled, so fixing the title re-runs `Fast gates` (pr-details.yml) and can turn `ci-ok` green.
- Given a pull request whose decision note isn't signed yet, so `Requirement guard, file checks (merge base's copy)` fails,
  when the rest of the run is still going,
  then the run isn't cancelled, so the reviewer who signs the note still sees the tests' results.
- Given a pull request run that a newer push cancelled with no failed job,
  when the run ends,
  then `ci-ok` doesn't run, so it ends as cancelled and the newer run's result is the one that shows.
- Given a merge group,
  when a job fails or its group's ref is gone,
  then `fail-fast` cancels the run and the group's live suites as before.
