# app.run-follow-resubscribe

- Status: active
- Since: 0.1.0
- Source: HAL-3963 (note 3 of the maintainer's review of #1209 on HAL-3961: subscribe again only after an event was seen, with a limit)

When the executor's stream of a followed run breaks after the follow has seen at least one event, the workflow runs service shall subscribe again after the last `seq` it saw, and go on collecting the run's events from there. It shall do so at most 3 times in a row without a new event in between; at the next break it shall close the stream and fail with the stream's error. Each new event starts the count again.

## Examples

- Given a followed run whose stream breaks after `state.entered` at seq 2,
  when the run then completes,
  then the follow subscribes again after seq 2 and gives the whole log, seq 1 to 3.
- Given a followed run whose stream breaks 4 times in a row with no new event,
  when it breaks the 4th time,
  then the follow fails with the stream's error, after 4 subscriptions in all.
- Given a followed run whose stream breaks 3 times, then brings a new event, then breaks 3 times again,
  when the run then waits,
  then the follow ends with the run waiting.
