# paperclip.pr-watcher-retargeted

- Status: active
- Since: unreleased
- Source: HAL-16394; #5007, #5008 and #5009 stayed blocked for about 7 hours on 22 Nov after GitHub moved their base to `main` (HAL-16392)

When the PR watcher checks an open task whose author holds it and has no run going, the PR watcher shall comment on the task and ask Paperclip to wake its author, once per pull request head, if one of its open pull requests, neither a draft nor in the merge queue, had its base changed to the repository's default branch, by hand or by GitHub after the old base branch was deleted, after the required note check (`Decision note and the guard's own paths`) last started on its head, or has no such check, and shall tell the author to close and reopen it or push a commit.

GitHub runs a ruleset's required workflow only on `opened`, `synchronize` and `reopened`, and ignores the `types` a workflow lists, so a base change alone never runs it again and the pull request stays blocked with every check green.

## Examples

- Given an open pull request into `main` whose note check started at 10:09 and whose base GitHub changed to `main` at 10:17:57 when the pull request below it merged,
  when the watcher runs twice,
  then it comments once, saying to close and reopen it, and the second run adds nothing.
- Given the same pull request after a reopen started the note check again at 17:49,
  when the watcher runs,
  then it does nothing.
- Given a pull request whose base changed to a branch other than the default branch,
  when the watcher runs,
  then it does nothing.
- Given a retargeted pull request that is a draft, or one in the merge queue,
  when the watcher runs,
  then it does nothing.
- Given a retargeted pull request whose checks GitHub cut off before the note check,
  when the watcher runs,
  then it does nothing, because it can't tell.
