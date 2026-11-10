# app.run-cancel-on-abort

- Status: active
- Since: 0.1.0
- Source: HAL-3963 (the maintainer's decision on HAL-3961, the review of #1209: `WorkflowRuns` cancels on abort)

When the signal of a follow aborts, whether before the follow began or while it runs, the workflow runs service shall close the stream and, if the executor has `cancel`, ask it to cancel the run, and then fail with `RunFollowStopped`. `RunFollowStopped` shall say whether the run was cancelled, which is when the summary the cancel returns says the run failed as cancelled, and, when the cancel failed, give its error. With an executor that has no `cancel`, it shall only stop following, and the run goes on.

## Examples

- Given a followed run that is going,
  when the signal aborts,
  then the executor is asked to cancel the run, and the follow fails with `RunFollowStopped` saying it was cancelled.
- Given a signal that was aborted before the follow began,
  when a run is followed,
  then the executor is asked to cancel the run.
- Given an executor whose cancel fails with "host unreachable",
  when the signal aborts,
  then the follow fails with `RunFollowStopped` saying it wasn't cancelled, with that error.
- Given a run that completed just before the cancel came,
  when the signal aborts,
  then the follow fails with `RunFollowStopped` saying it wasn't cancelled, with no error, and the run stays completed.
- Given an executor with no `cancel`,
  when the signal aborts,
  then the follow fails with `RunFollowStopped` saying it wasn't cancelled, and the run is still running.
