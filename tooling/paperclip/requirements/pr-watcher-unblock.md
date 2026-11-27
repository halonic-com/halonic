# paperclip.pr-watcher-unblock

- Status: active
- Since: unreleased
- Source: HAL-17692 (24 Nov): the board asked that a task whose blockers are all finished goes back to `todo` and its owner is woken, after HAL-17446 and HAL-17458 stayed blocked for hours behind merged work. HAL-20169 (26 Nov, board-approved): only for a blocker that finished after the task was set to blocked, and never twice for the same finish, after HAL-19131 and others were put back to `todo` on every pass

When the PR watcher runs, for every task that is `blocked`, is held by an agent with no run queued or running, has at least one task in its "blocked by", whose "blocked by" tasks are all done or cancelled, at least one of which finished after the task was last set to blocked (a time Paperclip doesn't give counts as after), and that the watcher hasn't already unblocked for the same blockers with the same last finish, the PR watcher shall set the task to `todo`, comment which tasks it waited on, and ask Paperclip to wake its agent; it shall change no other field and leave the task alone if it is no longer blocked, has an unfinished blocker, or was set to blocked again after its blockers finished, when it writes.

## Examples

- Given HAL-17446, blocked by HAL-17445, and HAL-17445 marked done,
  when the watcher runs,
  then HAL-17446 goes to `todo` with a comment naming HAL-17445 and its agent is woken.
- Given a task blocked by one done task and one cancelled task,
  when the watcher runs,
  then it goes to `todo`.
- Given a task blocked by one done task and one task in progress,
  when the watcher runs,
  then it stays blocked.
- Given a blocked task with nothing in its "blocked by", or one held by a person,
  when the watcher runs,
  then it stays blocked.
- Given a task the watcher found ready, which someone set to `in_progress` during the pass,
  when the watcher writes,
  then it leaves the task as it is.
- Given a task set to blocked at 06:48 by an agent, while every task in its "blocked by" had finished before then,
  when the watcher runs,
  then it stays blocked and nobody is woken.
- Given a task the watcher put back to `todo`, set to blocked again behind the same finished tasks,
  when the watcher runs,
  then it stays blocked, even when Paperclip gives no times.
- Given a task blocked by a task that was reopened and finished again after the task was set to blocked again,
  when the watcher runs,
  then it goes to `todo` and its agent is woken again.
