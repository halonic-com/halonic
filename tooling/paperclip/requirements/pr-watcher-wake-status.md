# paperclip.pr-watcher-wake-status

- Status: active
- Since: unreleased
- Source: HAL-17293; runs the PR watcher woke still read the pull request's state with `gh` about 3.5 times each (HAL-15967, 24 Nov)

When the PR watcher comments on a task to wake its author, the PR watcher shall add, for each open pull request the comment names, the status `pr_status` reports from the same pass's GitHub snapshot (the head commit, `ci-ok` on it with the names of its failing checks when it failed, whether it can merge, whether it is in the merge queue and the signed approvals), in the same words as `pr_status`, and one line saying the author doesn't need to check again unless they pushed since, without sending GitHub another request.

The snapshot holds no changed files, so a signed approval by Julian is shown as counting only within his limits (HAL-14809), and `pr_status` checks the paths.

## Examples

- Given pull request 4614 with a failed `ci-ok` on head `7dd0ccf`, failing checks `lint` and `test`, a conflict, outside the merge queue, and Liam's approval on that head,
  when the watcher wakes its author,
  then the comment says `head 7dd0ccf: ci-ok failure (failing: "lint", "test"); mergeable conflict`, `merge queue: not queued; approvals: Liam on 7dd0ccf`, and that there's no need to check again unless the author pushed since.
- Given the same pull request named by two reasons in one comment,
  when the watcher wakes its author,
  then its status appears once.
- Given a wake for a pull request that has merged,
  when the watcher wakes its author,
  then the comment carries no status lines.
