# paperclip.merge-control-cost

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700, board 24 Nov 17:47); HAL-17762

When the plugin decides an enqueue or a dequeue, it shall attach its cost: the merge groups already formed that it cancels (for a jump every queued one, for a dequeue its own and every one behind it, none for an enqueue at the back) and their runner-minutes at the configured minutes per group, counting each group once per pass even when several actions cancel it.

## Examples

- Given 9 queued entries, 8 with a merge group formed, and a fast-track pull request that jumps,
  when a pass runs,
  then the enqueue carries 8 groups and 8 × 240 runner-minutes.
- Given a pull request enqueued at the back,
  when a pass runs,
  then its cost is zero.
- Given the third of 5 queued entries taken out,
  when a pass runs,
  then the dequeue carries 3 groups.
- Given the second and fourth of 5 queued entries taken out in one pass,
  when a pass runs,
  then the first dequeue carries 4 groups and the second none.
