# paperclip.merge-control-fill-pause

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); the board, 21 Nov 19:35

While the board's fill pause holds, the plugin shall add only the pull requests it waits for, and shall end it once each of them is queued or has a green `ci-ok`, or at its time limit.

## Examples

- Given a pause waiting for #2 whose `ci-ok` is running,
  when a pass runs,
  then nothing is enqueued.
- Given #2 green, or the time limit passed,
  when a pass runs,
  then the pause ends and the pass fills as usual.
