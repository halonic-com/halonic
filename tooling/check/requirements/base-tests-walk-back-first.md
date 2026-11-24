# check.base-tests-walk-back-first

- Status: active
- Since: unreleased
- Source: HAL-17600

When the merge base's own push CI run on main has failed, CI's "Merge base's tests (no cache)" job shall walk back to the newest commit within 20 on main's first-parent history whose push CI run passed before it runs any tests, so it runs every package's tests once, not twice, and finishes inside its time limit.

## Examples

- Given a merge base whose push CI run failed, and a green push run two commits back,
  when the job starts,
  then it switches to that commit before installing and testing, and warns `baseline-walked-back`.
- Given a merge base whose push CI run passed, is still running, was cancelled or doesn't exist,
  when the job starts,
  then it tests the merge base, and the walk-back after the tests still catches a red main.
- Given a merge base whose push CI run failed, and no green push run within 20 commits,
  when the job starts,
  then it fails at once, pointing to `docs/guides/broken-main.md`.
