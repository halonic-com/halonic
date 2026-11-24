# paperclip.pr-watcher-review-priority

- Status: active
- Since: unreleased
- Source: HAL-17920, item 3 of HAL-17759; about 14 green pull requests waited for Liam at once on 24 Nov, all handed over with the same priority, so nobody could see which one waited longest

When the PR watcher checks an open task that its reviewer (Liam or Julian, not the author of its pull requests) holds with no run going, and one of its open pull requests is out of draft, not in the merge queue, has a green `ci-ok` on its head and no signed approval on that head, and the watcher's own "ready for review" comment for that head is more than one hour old, the PR watcher shall set the task's priority to `high` if it is `low` or `medium` when re-read right before the write, never set `critical` and never lower a priority, change no other field, wake nobody, count it in the pass summary and the metric `pr_watcher.review_priority_raised`, and list in the pass summary every such waiting head it handed over, whatever its age, with the task, the pull request and the hours since the handoff, oldest handoff first, logging the oldest five as one "longest waiting for review" line.

## Examples

- Given pull request 5701 handed to Liam at 15:59 UTC, green and not approved on its head, on a `medium` task,
  when the watcher runs twice at 17:00 UTC,
  then the task is `high` after the first pass, and the second pass changes nothing.
- Given the same pull request handed over at 16:01 UTC,
  when the watcher runs at 17:00 UTC,
  then the task stays `medium`.
- Given the same pull request on a task a person set to `high` or `critical`,
  when the watcher runs at 17:00 UTC,
  then the priority stays as it is.
- Given the same pull request approved on its head, red, or in the merge queue,
  when the watcher runs,
  then the priority stays and the pull request isn't listed.
- Given three waiting pull requests handed over at 13:00, 15:30 and 16:30 UTC,
  when the watcher runs at 17:00 UTC,
  then the pass summary lists them in that order, with 4.0, 1.5 and 0.5 hours.
