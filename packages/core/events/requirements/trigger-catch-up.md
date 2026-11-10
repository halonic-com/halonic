# events.trigger-catch-up

- Status: active
- Since: 0.1.0
- Source: HAL-540 (the `trigger.catchUp` flag agreed for Studio's "Caught up after sleep"), HAL-2542 and HAL-2524 (what it counts)

The events package shall let a run's trigger carry `catchUp`, set when a routine run started later than the tick's grace after its due time, with `skipped`: how many earlier due times of the routine the catch-up rule dropped on the same tick, and `countIsMinimum: true` when counting stopped at its limit. A trigger without `catchUp` shall mean the run started on time. When a run's events are summarized, the summary's trigger shall keep `catchUp` as `run.started` gave it.

## Examples

- Given `run.started` with a schedule trigger due at 07:30 and `catchUp: { skipped: 61 }`,
  when the run is summarized,
  then the summary's trigger has `catchUp: { skipped: 61 }`.
- Given `run.started` with a schedule trigger and no `catchUp`,
  when the run is summarized,
  then the summary's trigger has no `catchUp`.
