# app.run-follow-events

- Status: active
- Since: 0.1.0
- Source: HAL-4056 (plan approved on HAL-4064: a surface draws while it follows a run)

When a caller follows a run with an event callback, the workflow runs service shall call it once for every event it reads, oldest first, the stored events before the new ones, each before it decides whether that event stops the follow, with the log so far. It shall never call it once the follow has ended, waited, failed or been stopped. When the callback throws, the service shall close the stream and fail the follow with that error.

## Examples

- Given a run with two stored events that then waits,
  when it is followed with a callback,
  then the callback sees the two stored events, then the wait, each with the log up to it.
- Given a run whose stored log goes on past a wait,
  when it is followed with a callback,
  then the callback sees the wait and no event after it.
- Given a follow whose signal is aborted from inside the callback,
  when more events arrive,
  then the callback is not called again and the stream is closed.
- Given a callback that throws,
  when the first event arrives,
  then the follow fails with that error and the stream is closed.
- Given a workflow started with a callback,
  when the run completes,
  then the callback saw every event of the run.
