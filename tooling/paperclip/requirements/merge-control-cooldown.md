# paperclip.merge-control-cooldown

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); the board, 20 Nov 20:12; MERGER.md §4 rule 14

When a pull request was taken out as unmergeable in the queue, the plugin shall add it again only on a new head or once every pull request that was ahead of it has left the queue.

## Examples

- Given a cooldown with #1 ahead and #1 still queued,
  when a pass runs,
  then it waits.
- Given the queue ahead cleared, or a new head,
  when a pass runs,
  then it is enqueued and the cooldown is dropped.
