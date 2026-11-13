# contracts.request-count-store

- Status: active
- Since: 0.1.0
- Source: HAL-7197; build plan on HAL-195 (PR 4)

Where an adapter implements the request-count store behind `limits.dailyRequests`, it shall count one request for a UTC day unless the limit was already reached for that day, and answer whether the request was allowed and the count after the call. The count shall never go above the limit, even for parallel calls. A new day shall start from zero. A store that says it is durable shall keep the count over a restart.

## Examples

- Given a limit of 2,
  when three calls are made for one day,
  then the third is refused and the count stays 2.
- Given 20 parallel calls with a limit of 5,
  then exactly 5 are allowed.
- Given a durable store that is reopened,
  then the day's count is still there.
