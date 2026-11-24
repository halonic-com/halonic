# paperclip.merge-control-flake-reruns

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); HAL-17685 (board HAL-10 rule 3, 24 Nov)

While reruns aren't paused, when an approved fast-track pull request with a verified label has a red `ci-ok` whose log says the merge base's tests ended cancelled, or whose other failed jobs failed only in runner setup steps, the plugin shall rerun that run's failed jobs once per head.

## Examples

- Given a log saying the merge base's tests job ended as cancelled,
  when two passes run,
  then the failed jobs are rerun once.
- Given a job that failed in `Set up job`, and one that failed in `Run tests`,
  when a pass runs,
  then only the first is rerun.
- Given an unapproved one, an unverified label, or a run on another head,
  when a pass runs,
  then nothing is rerun.
