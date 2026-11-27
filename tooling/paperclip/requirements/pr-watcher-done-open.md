# paperclip.pr-watcher-done-open

- Status: active
- Since: unreleased
- Source: HAL-18284, added scope from HAL-17912 (25 Nov; HAL-17515 was done while #6033 conflicted with `main` for 11 hours)

When the PR watcher's pass finds a task in `done` that a branch with an open pull request names, and the author's newest comment on it has no line `PR watcher: moved to HAL-<n>`, the PR watcher shall, if one of those pull requests conflicts with its base branch, is no draft, isn't in the merge queue, and the watcher hasn't reported that conflict on its head before, move the task to `todo` and wake its holder once with the conflicting files, when its holder is the agent the branches name; otherwise it shall comment on the task once per head of each open pull request, naming it, and wake nobody. The PR watcher shall never mark a task done while one of its pull requests is open.

## Examples

- Given HAL-17515 in `done`, held by its author, whose pull request #6033 conflicts with `main`,
  when the watcher runs twice on the same head,
  then it moves the task to `todo` and wakes the author once, naming the conflicting files.
- Given a task in `done` whose branch has no open pull request,
  when the watcher runs,
  then it leaves the task done and doesn't comment.
- Given a task someone set to `done` while its pull request is open and can merge,
  when the watcher runs twice on the same head,
  then it comments once that the pull request is still open, and the task stays done.
- Given the same task, whose author's newest comment has the line `PR watcher: moved to HAL-4600`,
  when the watcher runs,
  then it doesn't comment.
