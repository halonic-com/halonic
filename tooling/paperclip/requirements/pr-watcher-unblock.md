# paperclip.pr-watcher-unblock

- Status: active
- Since: unreleased
- Source: HAL-17692 (24 Nov): the board asked that a task whose blockers are all finished goes back to `todo` and its owner is woken, after HAL-17446 and HAL-17458 stayed blocked for hours behind merged work

When the PR watcher runs, for every task that is `blocked`, is held by an agent with no run queued or running, has at least one task in its "blocked by", and whose "blocked by" tasks are all done or cancelled, the PR watcher shall set the task to `todo`, comment which tasks it waited on, and ask Paperclip to wake its agent; it shall change no other field and leave the task alone if it is no longer blocked, or has an unfinished blocker, when it writes.

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
