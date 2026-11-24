# paperclip.pr-watcher-review-wait

- Status: active
- Since: unreleased
- Source: HAL-17760, item 4 of HAL-17759; green pull requests waited 2 to 6 hours for a review after their handoff, and nobody heard about it

When the PR watcher checks an open task that its reviewer (Liam or Julian, not the author of its pull requests) holds with no run going, and one of its open pull requests is out of draft, not in the merge queue, has a green `ci-ok` on its head and no signed approval on that head, and the watcher's own "ready for review" comment for that head is more than one hour old, the PR watcher shall comment once per head on the task "PR watcher: waiting for review for over 1 h: #N, head `abc1234`, handed over at <time>.", waking nobody, adding "; no `Guard notes` run on this head" before the full stop when a check the merge queue requires has no run on that head, and count it in the pass summary and the metric `pr_watcher.review_waits`.

## Examples

- Given pull request 5701 handed to Liam at 15:59 UTC, green and not approved on its head,
  when the watcher runs twice at 17:00 UTC,
  then it comments once on the task, naming #5701, head `5701aaa` and 15:59 UTC, and wakes nobody.
- Given the same pull request with a green `ci-ok` but no `Guard notes` run on its head,
  when the watcher runs at 17:00 UTC,
  then the note ends "; no `Guard notes` run on this head.".
- Given the same pull request handed over at 16:01 UTC,
  when the watcher runs at 17:00 UTC,
  then it says nothing.
- Given the same pull request approved by Liam on its head,
  when the watcher runs,
  then it says nothing.
- Given the task held by the pull request's author, or by its reviewer with a run going,
  when the watcher runs,
  then it says nothing.
- Given a draft, a red or pending `ci-ok`, a pull request in the merge queue, or a head the watcher never handed over,
  when the watcher runs,
  then it says nothing.
