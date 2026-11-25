# paperclip.merge-control-conflict-prediction

- Status: active
- Since: unreleased
- Source: HAL-17909; the merge-time report on HAL-17891 (item 11)

When the queue is filled, the plugin shall rank a candidate that changes a file a queued pull request changes after the candidates of the same fast-track tier and score that don't, log it as a predicted conflict, and shall never keep it out of the queue for that.

## Examples

- Given a queued pull request changing a file, an older candidate changing the same file and a newer one that doesn't,
  when a pass runs,
  then the newer one is enqueued first and the older one after it.
