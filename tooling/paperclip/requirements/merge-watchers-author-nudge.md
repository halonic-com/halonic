# paperclip.merge-watchers-author-nudge

- Status: active
- Since: unreleased
- Source: HAL-17929; Chief on HAL-17912 (25 Nov), the live watchers of 24–25 Nov

When a `pr-watch` pass has taken a company's GitHub snapshot, the plugin shall wake the task an open pull request's branch names on the watcher's first repository, from a branch in that repository, once per head and kind: when the pull request it was stacked on merged and GitHub moved it to the default branch with no push since, and the branch's agent holds the task, set to `todo` first in any status, saying to rebase on the default branch and ask the reviewer to re-approve, naming a conflict the move left and, for a pull request approved on its head, a range-diff re-approval; when it conflicts with its base, is not a draft and not in the merge queue, and its task is in `backlog` or `blocked` with the branch's agent holding it, set to `todo` first, saying to rebase; when it is out of draft with `ci-ok` green on its head, mergeable or not yet known, with no signed approval on its head, and the branch's agent holds its unparked task, saying to hand the task to the reviewer; and when it is approved and green on its head, mergeable and not in the merge queue, and its branch starts with a prefix in the `handQueueBranches` setting, saying to merge it by hand. It shall put every nudge for one task in one comment, read only the snapshot, plugin state and Paperclip's tasks and agents, send no GitHub request, and only log what it would write while `mergeWatchersDryRun` is on.

## Examples

- Given #600 merged and #601, stacked on it, moved to `main` with a conflict and its task blocked,
  when two passes run on the same head,
  then the first sets the task to `todo` and wakes it once, naming the conflict, and the second does nothing.
- Given a green, unreviewed pull request whose task its author holds,
  when passes run on the same head and then on a new one,
  then the author is told to hand the task to the reviewer once per head, and not at all while the reviewer holds it.
- Given an approved, green pull request on a branch `handQueueBranches` names,
  when two passes run,
  then its task gets one note to merge it by hand.
- Given a conflicting pull request on a blocked task,
  when it is in the merge queue, then out of it on the same head twice, then on a new head,
  then the task is set to `todo` and woken once for each head, and not while queued.
