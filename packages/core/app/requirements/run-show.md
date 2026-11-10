# app.run-show

- Status: active
- Since: 0.1.0
- Source: HAL-2742; C174 on HAL-2000 and HAL-1984; cli-output revision 27, section 3.4 (HAL-1981)

The run history shall show one run, real or test, as its log tells it: the summary worked out from the run's events, and those events oldest first. The summary shall be worked out from the same events it comes with, so the two always agree. For a run id the store doesn't know, it shall show nothing.

## Examples

- Given a completed run `01JD8Q`,
  when it is shown,
  then its summary says completed and its events are the whole log, oldest first.
- Given a run that waits for `approve` or `reject`,
  when it is shown,
  then its summary says waiting and accepts both events.
- Given a test run,
  when it is shown,
  then it is shown like any other run.
- Given no run `01JD8X`,
  when it is shown,
  then nothing is shown.
