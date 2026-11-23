# runtime.run-driving

- Status: active
- Since: unreleased
- Source: HAL-17038, part c of the plan on HAL-13210

When a run object's alarm finds a run's timer due, the Worker's run object shall hand the timer to the Worker's engine (`runtime.worker-runs`), built from the Worker's `env` on the first timer, so the run moves on one step per timer as on `halonic serve`. When the engine can't be built, the timer shall fail and be tried again, and the next try shall build the engine again.

Rationale: the API starts a run and its first step is always a timer. Without a listener every timer failed on its alarm, so no run the Worker started ever got past `run.started`.

## Examples

- Given the `acme` hub's `handle-order` workflow, whose first step asks a model, started through the Worker's engine, when its run object's alarm runs, then the model answers, the run's last event is `run.completed` and no timer is left; and once the next alarm has run, the run list shows it `completed`.
