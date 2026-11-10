# app.run-follow

- Status: active
- Since: 0.1.0
- Source: HAL-3814 (plan-run, approved on HAL-3895: no missed events, a signal to stop); HAL-3963 (a broken stream after an event, cancel on abort)

The workflow runs service shall follow a run from its first event until the run completes, fails or waits after a given sequence number, and give the run's whole log with the summary worked out from it. It shall miss no event, including events recorded before the follow began. When the executor's stream ends without an error, it shall give the log as it stands. When the stream ends with an error before the follow has seen an event, it shall fail with that error; after an event, it subscribes again (`app.run-follow-resubscribe`). When its signal is aborted first, it shall stop following, close the stream and fail with the events seen so far, and it cancels the run if the executor can (`app.run-cancel-on-abort`).

## Examples

- Given a run that fails before the follow begins,
  when it is followed,
  then its whole log comes back, ending with `run.failed`, and the summary says failed.
- Given a run that waits for `approve` after the follow began,
  when it is followed,
  then the follow ends at `run.waiting`, and the summary says waiting.
- Given a run that waited at seq 4 and was then sent `approve`,
  when it is followed after seq 4,
  then the follow goes past the earlier wait and ends when the run completes.
- Given a run whose stream breaks before the follow has seen an event,
  when it is followed,
  then the follow fails with the stream's error.
- Given a run that is still going,
  when the signal is aborted,
  then the stream is closed and the follow fails with the events seen so far.
