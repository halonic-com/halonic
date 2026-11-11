# engine.child-runs-end-with-run

- Status: active
- Since: 0.1.0
- Source: HAL-5214, findings of the 11 Nov code review

When a run ends, the local executor shall end every child run it started and hasn't heard end, all the way down: the one a `workflow` state waits on and those a `foreach` state's items run. Each ends with `run.failed` and `reason: "cancelled"`, and its harness calls are stopped. When the run was cancelled, the error is "The run was cancelled." (`engine.local-run-cancel`); otherwise it is "The run that started this one ended, so this one was cancelled."

## Examples

- Given a run in a `foreach` state whose two items each run a child run whose model call is due,
  when the run is cancelled,
  then both child runs have failed with `reason: "cancelled"`.
- Given that run,
  when the first item's child run fails,
  then the run fails, and the second item's child run has failed with `reason: "cancelled"` and its model call is never made.
