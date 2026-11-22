# events.harness-stopped

- Status: active
- Since: unreleased
- Source: HAL-15968, Owen's plan (option A) approved with changes by Liam

The run log shall have a `harness.stopped` event for a step whose harness program had given its result but didn't exit in time, so Halonic stopped it and kept the result, with the step's `state`, its `agent`, the `harness` id, the `reason`, today only `no-exit-after-result`, and `afterMs`, how long Halonic waited for the exit. The event shall have no cost or token use, shall leave the run's waiting approvals as they are, and shall leave the step running, so it goes on with the result.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `harness.stopped` is among them.
- Given a `harness.stopped` event,
  when its fields are listed,
  then it has `state`, `agent`, `harness`, `reason` and `afterMs`, all required, and no `cost` or `usage`.
- Given a run summary,
  when a `harness.stopped` event is added,
  then its cost, use and waiting approvals don't change, and the run is still running.
- Given a run log written before `harness.stopped` existed,
  when it is read,
  then it reads as before.
