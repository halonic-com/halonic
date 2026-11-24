# paperclip.merge-control-queue-first

- Status: active
- Since: unreleased
- Source: HAL-17906; the merge-time report on HAL-17891 (item 4)

When a merge-control pass decides its actions, the plugin shall list every `dequeue` first, then every `enqueue`, then all other actions, keeping the order it decided within each kind, so that comments, reruns, cancels and wakes never delay a queue write.

## Examples

- Given a pass that removes a conflicting pull request, holds the pull request of a failed merge group with a comment and adds a passing pull request,
  when `decide` runs,
  then its actions are the `dequeue`, then the `enqueue`, then the `comment`.
- Given actions of several kinds in mixed order,
  when they are put queue first,
  then the dequeues come first and the enqueues second, each kind in its own order, and the rest follow in theirs.
