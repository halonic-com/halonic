# engine.end-interrupted-runs

- Status: active
- Since: 0.1.0
- Source: [HAL-1668 failure-path decisions](/HAL/issues/HAL-1668#document-decisions); task HAL-1728

When the engine starts, it shall end every run whose status is `running` (a run it was going through when it stopped, with no end event) by appending a `run.failed` event with `reason: "interrupted"`, the state the run was in, and the time of the start. It shall leave runs that are `waiting` for an event, a timer or a child run as they are, because they are meant to outlive a restart, except a child run whose parent has ended (`engine.end-orphaned-child-runs`). Before that, a run that has a recorded connector call with no result gets `outcome: "unknown"` and waits for `retry` or `skip` (`engine.run-connector-calls`), so it is waiting, not ended. It shall take the run's status and its last event from one read of its log, and if the log moves on while the engine ends it, something still writes to that run, so the engine shall leave it as it is. It assumes one engine per run store; the run kernel (HAL-186) that calls it states that rule or holds a lock, and wakes a parent waiting on a run it ended.

## Examples

- Given a run that entered the state `pay` and has no end event,
  when the engine starts,
  then the run's log ends with `run.failed` in the state `pay`, with `reason: "interrupted"`, and the run's status is `failed`.
- Given a run that waits for the event `approved`, and a run that completed,
  when the engine starts,
  then neither log changes.
- Given a running run that completes after the list of running runs and before the engine reads its log,
  when the engine starts,
  then its log ends with `run.completed`, and the engine doesn't end the run.
- Given a run whose log gains an event while the engine ends it,
  when the engine starts,
  then that event is the last in its log, and the engine doesn't end the run.
