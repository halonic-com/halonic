# paperclip.merge-control-label-noop

- Status: active
- Since: unreleased
- Source: HAL-17909; the board, 25 Nov 01:25; #5703, until HAL-17992 changes `ci.yml`

When the newest `ci-ok` on a pull request's head is green and a `ci-ok (label added, nothing to run)` check run's workflow run was created after it, the plugin shall treat `ci-ok` as `label-noop`, not passed, with the reason "a label run came after CI: GitHub sees no ci-ok; close and reopen the PR".

## Examples

- Given a green `ci-ok` and no label run,
  when a pass runs,
  then it is enqueued.
- Given a label run created after the green `ci-ok`,
  when a pass runs,
  then it isn't enqueued; once a newer real `ci-ok` run is green, it is.
