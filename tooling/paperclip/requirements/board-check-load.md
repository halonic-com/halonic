# paperclip.board-check-load

- Status: active
- Since: unreleased
- Source: HAL-16194; the Board Checker addendum on HAL-15997, section 1 part (c) (22 Nov)

When the board check runs its first pass of each hour, the Agent tools plugin shall work out the team load from the pass's listing of open tasks, leaving out Pip and agents that are paused, waiting for approval or terminated: the agents with no `todo` task and no `in_progress` task without open blockers, and the agents with more than 10 tasks `in_progress`; it shall add both lists to the `board-waiting` document in a section "For Chief", and when Chief's task is set and either list differs from the last one the gate actually sent to Chief, it shall comment both lists once on Chief's task through the write gate.

## Examples

- Given Nina with no open tasks, Priya whose only task in progress has an open blocker, Mateo with a `todo` task, and Pip with none,
  when the job runs at 14:00 with Chief's task set,
  then it comments "Nothing to start (no todo, no unblocked in progress): Nina, Priya." on Chief's task, without Pip.
- Given the same team at 15:00,
  when the job runs,
  then it doesn't comment again.
- Given the same team and an hourly pass at 14:00 with writes off,
  when the board turns writes on and the job runs at 15:00,
  then it comments the lists on Chief's task once.
- Given Priya with 13 tasks in progress,
  when the job runs on the hour,
  then the list of more than 10 tasks in progress reads "Priya (13)".
