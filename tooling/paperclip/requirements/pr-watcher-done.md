# paperclip.pr-watcher-done

- Status: active
- Since: unreleased
- Source: HAL-15359; the hold line counts only after the merge (HAL-17692, 24 Nov); the PR watcher rules in the seat plan on HAL-15298 (section 3, item 2), approved by the board on 21 Nov; the safer done rules Liam set on HAL-15359 on 22 Nov for pull requests found by branch; the dry-run check on HAL-15929 (22 Nov)

When the PR watcher checks an open task held by the agent that every one of its pull requests' branches names, whose pull requests are all closed, which has no child task that isn't done or cancelled, and whose author's newest comment on the task doesn't hold it open with a line written after the last of them merged, the PR watcher shall mark the task done with a comment only if at least one of them merged, every merged one has `ci-ok` passed on its merge commit or is included in the commit of its base branch's newest successful CI push run, and nobody but the watcher has commented on the task since the last of them merged; when someone has, it shall instead comment and ask Paperclip to wake the author once for that merge.

## Examples

- Given a task with pull request 4485 on its branch, merged with `ci-ok` passed on its merge commit,
  when the watcher runs,
  then it comments that #4485 merged green and marks the task done.
- Given pull request 468, merged on 9 Nov without `ci-ok` on its merge commit, and a later green CI run on `main` that includes it,
  when the watcher runs,
  then it marks the task done.
- Given pull request 4574, merged with its `ci-ok` on `main` still queued and the newest green CI run older than its merge,
  when the watcher runs,
  then it leaves the task as it is.
- Given pull request 4485, merged green at 20:48, and the author's newest comment on the task, written at 21:00, has the line `PR watcher: more PRs to come`,
  when the watcher runs,
  then it leaves the task open, and wakes the author once their newest comment no longer has that line.
- Given pull request 4485, merged green at 20:48, and the author's newest comment on the task, written at 20:00, has the line `PR watcher: more PRs to come`,
  when the watcher runs,
  then it marks the task done.
- Given a task with pull request 4485, merged green, and pull request 9001, closed without merging,
  when the watcher runs,
  then it marks the task done and names only #4485.
- Given a task held by Priya whose pull request is on the branch `mateo/HAL-4485-work`, or whose pull requests' branches name both Priya and Mateo,
  when the watcher runs,
  then it does nothing and logs why.
- Given a task whose pull request merged green and which has a blocked child task,
  when the watcher runs,
  then it leaves the task open until the child task is done or cancelled.
- Given pull request 4485, merged green at 20:48, and a comment on the task at 21:30 that adds a follow-up,
  when the watcher runs,
  then it leaves the task open and wakes the author once, saying to mark it done if nothing else is left.
