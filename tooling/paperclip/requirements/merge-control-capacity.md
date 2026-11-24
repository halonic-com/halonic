# paperclip.merge-control-capacity

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700, board 24 Nov 17:47); HAL-17762 (Liam: the main-red fix jumps anyway)

When a pull request would jump the merge queue and the snapshot shows no free merge-queue runner slot, a job waiting for a merge-queue runner, or capacity it couldn't read, the plugin shall enqueue it without a jump and log why, except the fix pull request of a main-red freeze, which it shall enqueue with a jump and its cost and log as `JUMP_SHORT`.

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
- Given a main-red freeze, its fix pull request and no free merge-queue slot,
  when a pass runs,
  then the fix is enqueued with a jump and the cost of the groups it cancels.
