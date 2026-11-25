# paperclip.pr-watcher-parent-block

- Status: active
- Since: unreleased
- Source: HAL-16194 (25 Nov): the board asked, through HAL-10, that the plugin fix a task blocked by its own parent or a task above it (`parent_block`), after HAL-18142 stayed blocked by its parent HAL-17956

When the PR watcher runs, for every task that is `blocked`, is held by an agent with no run queued or running, and has an unfinished task in its "blocked by" that is its parent or a task above its parent, the PR watcher shall remove those tasks from its "blocked by", comment that this was a `parent_block` deadlock and which tasks it removed, and, if every task left in its "blocked by" is done or cancelled, set the task to `todo` and ask Paperclip to wake its agent; it shall remove no other blocker, change no other field, and leave the task alone if, when it writes, the task is no longer blocked or those tasks are no longer unfinished blockers above it.

## Examples

- Given HAL-18142, a child of HAL-17956, blocked only by HAL-17956, which is in progress,
  when the watcher runs,
  then HAL-17956 is removed from HAL-18142's "blocked by", HAL-18142 goes to `todo` with a comment naming HAL-17956, and its agent is woken.
- Given a task blocked by its grandparent and by an unrelated task in progress,
  when the watcher runs,
  then only the grandparent is removed, the comment says it stays blocked, and nobody is woken.
- Given a task blocked by its parent, which is done,
  when the watcher runs,
  then no link is removed and the task goes to `todo` as any task whose blockers all finished.
- Given a task blocked by a sibling, not by a task above it,
  when the watcher runs,
  then it stays blocked.
- Given a dry run,
  when the watcher finds a `parent_block`,
  then it only logs it.
