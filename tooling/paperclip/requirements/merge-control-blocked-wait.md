# paperclip.merge-control-blocked-wait

- Status: active
- Since: unreleased
- Source: HAL-18324; the board's shadow-against-live comparison on HAL-10 (25 Nov 07:56–08:47 UTC), where the shadow would have enqueued #5889, approved and green but blocked on GitHub, which the Merger left out; HAL-16399

When a pull request passes the gate but GitHub shows its merge state as blocked, the plugin shall not enqueue it, shall log that it waits because GitHub shows it as blocked, and shall enqueue it on a later pass once GitHub no longer does.

## Examples

- Given #5889, approved and green, that GitHub shows as blocked,
  when two passes run,
  then neither enqueues it, the first posts the blocked note once, and a pass after GitHub shows it as clean enqueues it.
