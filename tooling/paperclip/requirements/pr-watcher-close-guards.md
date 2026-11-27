# paperclip.pr-watcher-close-guards

- Status: active
- Since: unreleased
- Source: HAL-18284 (25 Nov, from the Improvements session on HAL-17912; a stacked pull request's task closed after the first merge on HAL-18054)

When the PR watcher would mark a task done under `paperclip.pr-watcher-done`, the PR watcher shall leave the task open instead if the last of its pull requests merged more than the `mergeWindowHours` setting (12 by default) before the check, if the task's description or one of its 3 newest comments by anyone but the watcher contains "PR 1 of" followed by a number, "more PRs" or "stacked on" in any letter case, or if the task has a board card: it is in `in_review` held by a person, or it has a card nobody answered yet.

## Examples

- Given a task whose pull request merged green 13 hours before the check,
  when the watcher runs,
  then it leaves the task open.
- Given a task whose pull request merged green 2 hours before the check, with a card on it that the board hasn't answered,
  when the watcher runs,
  then it leaves the task open.
- Given a task whose description says "PR 1 of 3", or whose second-newest comment says "stacked on #5808", or whose third-newest comment says "More PRs follow",
  when the watcher runs,
  then it leaves the task open.
- Given a task whose fourth-newest comment says "more PRs" and whose pull request merged green 2 hours before the check,
  when the watcher runs,
  then it marks the task done.
- Given a task whose pull request merged green 2 hours before the check, with none of these,
  when the watcher runs,
  then it marks the task done as before.
