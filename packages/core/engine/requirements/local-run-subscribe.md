# engine.local-run-subscribe

- Status: active
- Since: 0.1.0
- Source: HAL-1527, step 3(b) of the HAL-186 plan

When a caller subscribes to a run through the local executor, the executor shall give the listener the run's stored events after the given sequence number, then each new event as it is appended, in order and without gaps, read from the run store. Once the listener has every event of a run that has ended, the executor shall close the stream without an error. For a run that doesn't exist, it shall close the stream with an error. It shall never call the listener before `subscribe` returns, nor after the caller closes the subscription.

## Examples

- Given a running run with 3 events,
  when a caller subscribes after event 1 and the run then completes,
  then the listener gets events 2 onwards in order, and the stream closes without an error.
- Given no run with the id `r-missing`,
  when a caller subscribes to it,
  then the stream closes with an error that names the run.
