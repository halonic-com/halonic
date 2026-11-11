# engine.end-orphaned-child-runs

- Status: active
- Since: 0.1.0
- Source: HAL-6142 (a follow-up of the review of #1908, HAL-6090)

When the engine starts, after it ends the runs it was going through (`engine.end-interrupted-runs`), it shall end every child run that is `waiting` while the run that started it has ended, by appending a `run.failed` event with `reason: "cancelled"`, the state the child was in, and the error "The run that started this one ended, so this one was cancelled." Such a child is left when the engine stopped after its parent's end was written and before the parent's child runs were cancelled, and no one would ever answer it. A child it ends this way may leave its own child waiting under an ended run, so the engine shall look at the waiting runs again until it ends none. It shall leave a waiting child whose parent waits or has no log as it is, and, as for a running run, a child whose log moves on while the engine ends it.

## Examples

- Given a run that failed while its child run waits for `approved`,
  when the engine starts,
  then the child's log ends with `run.failed`, `reason: "cancelled"`, in the state it waited in.
- Given a run that waits on its child run, which waits for `approved`,
  when the engine starts,
  then neither log changes.
- Given a run that failed, its child that waits on a grandchild, and the grandchild that waits for `approved`,
  when the engine starts,
  then both the child and the grandchild have failed with `reason: "cancelled"`.
