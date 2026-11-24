# paperclip.merge-control-fill-order

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); HAL-14892, HAL-16115 (target 15); MERGER.md §4 "Fill order"; HAL-17762

When the queue is filled, the plugin shall enqueue passing candidates in order of fast-track first whatever the board's boost, then the board's boost plus the `queue.prio` score, oldest first on a tie, until the queue holds the fill target (15, or the lower target set while runners are short).

## Examples

- Given a pull request others are stacked on, one whose task blocks a task, and a plain one,
  when a pass runs,
  then they are enqueued in that order.
- Given 13 queued and three candidates,
  when a pass runs,
  then two are enqueued, and none with a target of 12.
