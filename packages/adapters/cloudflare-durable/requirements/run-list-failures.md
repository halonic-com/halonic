# cloudflare-durable.run-list-failures

- Status: active
- Since: unreleased
- Source: HAL-13900; follow-up of HAL-13864 (the Worker's run list stayed empty for weeks with no log line)

When a run list update fails, the Cloudflare run object shall report the failure with the run's ID, the number of tries in a row that have failed and the time to the next try, and shall keep the update for that next try. The default report shall be one line in the Worker's log with the error's name and message, never its stack or cause. The run object shall not compile without a run list, and a run object deployed without one shall report every try as a failure that says the run list is missing.

## Examples

- Given a run list that rejects every send,
  when the alarm fires, then again 1 second later,
  then the failure is reported for attempt 1 with the next try in 1 second, then for attempt 2 with the next try in 2 seconds.
- Given a Worker that exports `RunObject` with no run list,
  when a run is appended and the alarm fires,
  then the Worker's log says the run list is missing, and the update is kept.
- Given a subclass of `RunObject` without `runList()`,
  when it is typechecked,
  then it fails to compile.
