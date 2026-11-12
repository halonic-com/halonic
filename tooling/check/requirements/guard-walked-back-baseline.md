# check.guard-walked-back-baseline

- Status: active
- Since: 0.1.0
- Source: HAL-7633

When CI walks the test baseline back to an older main commit because the merge base's tests fail, the requirement guard shall take only the test results from that older commit and compare the files with the main commit the pull request's merge ref was built on, so main's commits in between are not blamed on the pull request.

## Examples

- Given a merge base whose tests fail, so the baseline walks back to commit W,
  when main changed a requirement between W and the merge base and the pull request doesn't touch it,
  then the guard reports nothing for that requirement.
- Given the same walk-back,
  when the pull request runs fewer tests than W's results,
  then the guard still reports it.
