# engine.local-run-cancel

- Status: active
- Since: 0.1.0
- Source: HAL-3963 (the maintainer's decision on HAL-3961, the review of #1209: an optional `RunExecutor.cancel`)

When someone cancels a run that hasn't ended, the local executor shall end it with `run.failed`, `reason: "cancelled"` and the state it was in, whether it was running or waiting, and it shall end the child run the run waits on, all the way down, the same way, the run first. It shall stop the harness calls of the runs it ends, with everything they opened. A model or connector call going on finishes, and the run records nothing it gives. A run that has already ended shall stay as it is, and the cancel gives its summary. A cancel of a run that doesn't exist shall be refused with `engine.run-unknown`.

## Examples

- Given a run whose model call is due,
  when it is cancelled and the call's timer then fires,
  then the run's log ends with `run.failed`, `reason: "cancelled"`.
- Given a run that waits for `approve`,
  when it is cancelled,
  then it has failed with `reason: "cancelled"`.
- Given a run that waits on a child run that waits for `approve`,
  when the run is cancelled,
  then both have failed with `reason: "cancelled"`.
- Given a run that completed,
  when it is cancelled,
  then its log doesn't change, and the cancel gives the completed summary.
- Given a harness call that is going on,
  when its run is cancelled,
  then the harness run, its session and its bridge are closed, and the run has failed with `reason: "cancelled"`.
