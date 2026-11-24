# paperclip.merge-control-ci-ok

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); MERGER.md §4 rule 7; #4340

When the gate reads `ci-ok` on a pull request's head, the plugin shall take the newest `pull_request` run by run creation and then start, and shall treat it as pending while any CI job or any `ci-ok` run on the head is unfinished.

## Examples

- Given an older green `ci-ok` run and a newer cancelled one,
  when a pass runs,
  then `ci-ok` is cancelled and it isn't enqueued.
- Given a CI job still running, or a queued rerun,
  when `ci-ok` is read,
  then it is pending; a merge-group `ci-ok` alone is missing.
