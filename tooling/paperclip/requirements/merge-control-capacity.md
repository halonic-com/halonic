# paperclip.merge-control-capacity

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700, board 24 Nov 17:47)

When a pull request would jump the merge queue and the snapshot shows no free merge-queue runner slot, a job waiting for a merge-queue runner, or capacity it couldn't read, the plugin shall enqueue it without a jump and log why.

## Examples

- Given a fast-track pull request with 9 entries queued and no free merge-queue slot,
  when a pass runs,
  then it is enqueued without a jump and the log says `NO_JUMP`.
- Given jobs waiting only on another runner label,
  when a pass runs,
  then the jump goes ahead.
- Given capacity the reader couldn't read,
  when a pass runs,
  then nothing jumps.
