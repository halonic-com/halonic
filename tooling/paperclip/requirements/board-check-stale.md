# paperclip.board-check-stale

- Status: active
- Since: unreleased
- Source: HAL-17732, from the model-mix watcher's first pass (24 Nov): tasks the board holds were read as ownerless, standing duties as stuck, and todos the delegation-cycle guard left unassigned woke nobody

When the board check runs its first pass of each hour, the Agent tools plugin's board check shall sort every open task in the pass's listing into one verdict, in this order: a task with no agent assignee and a user assignee is waiting on the board, never stuck, a slow review or ownerless; a task with an unblock descriptor, a routine's origin or a scheduled monitor is standing and skipped; a todo with neither assignee, created 4 hours ago or more, has no owner, for the reason "cycle guard" when an agent created it under a parent task and "missing assignee" otherwise; an agent's task in review untouched for 8 hours is a slow review; an agent's todo or task in progress with no run, untouched for 24 hours, is stuck. It shall keep the lists in plugin state as identifiers, and, through the write gate, put one comment on Chief's task naming each no-owner task not reported yet with its reason, and wake Chief's task once, only when the pass's other writes leave room under the gate's ceilings; a task counts as reported only once that comment and wake actually went out, and is reported again only after it had an owner.

## Examples

- Given a todo with no agent assignee and the board user as its assignee, 2 days old,
  when the job runs on the hour,
  then the task is on the waiting-on-board list, and nothing goes to Chief.
- Given an agent's task in progress, untouched for 2 days, with a scheduled monitor,
  when the job runs on the hour,
  then the task is on no list.
- Given a todo with no assignee that Chief created under a parent task 5 hours ago,
  when the job runs on the hour twice,
  then Chief's task gets one comment "- HAL-…: cycle guard, no owner since …" and one wake, and nothing on the second pass.
- Given the same todo and an hourly pass with writes off,
  when the board turns writes on and the job runs the next hour,
  then Chief hears of the task once.
- Given an hourly pass whose other parts already plan 5 comments,
  when the job runs,
  then the stale part writes nothing and reports the task on a later pass.
