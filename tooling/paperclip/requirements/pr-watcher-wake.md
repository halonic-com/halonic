# paperclip.pr-watcher-wake

- Status: active
- Since: unreleased
- Source: HAL-15359; the PR watcher rules in the seat plan on HAL-15298 (section 3, item 2), approved by the board on 21 Nov

When the PR watcher checks an open task whose author holds it and has no run going, the PR watcher shall comment on the task and ask Paperclip to wake its author, once per pull request head and reason, if one of its open pull requests has a failed `ci-ok` on its head, conflicts with its base branch while it is not in the merge queue, or has a review comment newer than the watcher's and the author's last comments on the task.

## Examples

- Given pull request 4614 with a failed `ci-ok` on its head and a conflict, outside the merge queue,
  when the watcher runs twice,
  then it comments once, naming both, and the second run adds nothing.
- Given a conversation comment with a `[major]` finding, newer than the author's last comment on the task,
  when the watcher runs,
  then it comments that there is a new review comment.
- Given a GitHub review that only says "LGTM", a `[nit]`, and conversation comments saying "No changes requested" or "Addressed the changes requested",
  when the watcher runs,
  then it does nothing.
- Given the task is held by its reviewer, not the agent the branch names,
  when the watcher runs,
  then it does nothing.
- Given a pull request with a green `ci-ok`, no conflict and no new review comment,
  when the watcher runs,
  then it does nothing.
- Given a person's comment on the task that copies an earlier watcher report, marker included,
  when the watcher runs,
  then it still wakes the author, because only its own comments count as an earlier report.
