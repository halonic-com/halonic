# paperclip.merge-control-shadow

- Status: active
- Since: unreleased
- Source: HAL-17706; the merge controller ADR (HAL-17700, board 24 Nov 17:47: each decision's cost in the daily diff)

While merge control is in `shadow` mode, the plugin shall decide each pass without sending any write or resolving the queue token, keep each UTC day's decided actions once with their cost next to the writes the Merger made, and on the first pass of the next day post one diff of the two on the configured task; `off`, the default, shall read and keep nothing.

## Examples

- Given `shadow` mode and a pass that decides an enqueue, a dequeue and a rerun,
  when the pass runs,
  then no write is sent and the queue token is never resolved.
- Given a day on which merge control would have queued #30 with a jump that cancels 9 groups, and the Merger queued it without one and cancelled run 777,
  when the first pass of the next day runs,
  then one comment on the configured task lists #30 as different with its cost and run 777 as only the Merger's.
- Given no mode set, or a value other than `off`, `shadow` or `act`,
  when a pass would run,
  then it reads no facts and keeps nothing.
