# runtime.run-list

- Status: active
- Since: unreleased
- Source: HAL-13864

The Worker's run object shall send each run's summary to the D1 run list that the Worker's `RunStore.list` reads. Once a run object's alarm has run after an append, that run shall be in the list.

Rationale: the adapter's run object has no run list of its own. Without the Worker's, every send failed and was retried forever, so the run list and the admin export, which finds runs through it, never held a run.

## Examples

- Given a run appended through the Worker's run store, when its object's alarm runs, then `list()` holds the run.
