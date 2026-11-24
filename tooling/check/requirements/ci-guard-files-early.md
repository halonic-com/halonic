# check.ci-guard-files-early

- Status: active
- Since: unreleased
- Source: HAL-17892 (Chief's go on the merge-time report, HAL-17891, 24 Nov)

When `.github/workflows/ci.yml` runs on a ready pull request that changes code, the `guard-files` job shall run the merge base's copy of the requirement guard with `--skip-test-runs`, with the merge base's dependencies and Node and the merge base's files from the merge ref's first parent, without waiting for the build or the merge base's tests, and shall fail `ci-ok` when it finds a problem.

## Examples

- Given a ready pull request that adds a `.skip` to a test without a decision note,
  when CI runs on it,
  then `Requirement guard, file checks (merge base's copy)` fails within about 3 minutes of the push, naming the file, and `ci-ok` fails when the run ends.
- Given a pull request whose own copy of the guard drops the skip check,
  when `guard-files` runs,
  then it runs the merge base's copy, which still reports the skip.
- Given a draft, or a pull request that changes only docs,
  when CI runs on it,
  then `guard-files` skips, like the guard job.
