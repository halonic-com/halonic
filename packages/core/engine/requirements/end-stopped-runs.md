# engine.end-stopped-runs

- Status: draft
- Since: unreleased
- Source: HAL-13678 (C210 TR2, Kim's check of HAL-12799); `engine.end-interrupted-runs`

When a caller has closed an engine on purpose and gives the reason as a typed cause, the engine shall end at once each run whose status is `running` by appending a `run.failed` event with `reason: "interrupted"`, the state the run was in, the time and that `cause`, as `engine.end-interrupted-runs` would end it on the next start. It shall end each parent run that is `waiting` on a run it ended the same way, up to the top-level run, because nothing would wake it. It shall then cancel each waiting child run whose parent has ended (`engine.end-orphaned-child-runs`). It shall leave other `waiting` runs and ended runs as they are, and, as `engine.end-interrupted-runs`, a run whose log moves on while it ends it.

## Examples

- Given a run in the state `pay` with no end event,
  when the engine ends the stopped runs with the cause `{ kind: "denied", code: "workspace.trust-removed" }`,
  then the run's log ends with `run.failed` in the state `pay`, with `reason: "interrupted"` and that cause.
- Given a parent run waiting in the state `check` on a child run that is going,
  when the engine ends the stopped runs,
  then both runs end with `reason: "interrupted"` and the cause.
- Given a run that waits for the event `approved` and has no child,
  when the engine ends the stopped runs,
  then its log doesn't change.
