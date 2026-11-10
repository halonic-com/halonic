# fs-node.run-store-lock-release

- Status: active
- Since: 0.1.0
- Source: HAL-2701 (review of the Studio shell's run commands, HAL-3918); `fs-node.run-store-lock`

When the folder run store has stored an append's events but can't remove the run's lock afterwards, it shall still answer the append as stored, with the new last seq, and pass the release error to its `onLockReleaseError` hook, so a caller that retries doesn't conflict with its own events. When the append stored nothing (a conflict), it shall fail with the release error. The Studio shell's run store answers both cases alike.

## Examples

- Given run `r1` with three events, and a lock file that can't be removed,
  when `append("r1", 3, [event 4])` is called,
  then it gives `{ ok: true, lastSeq: 4 }`, the hook gets `r1` and the error, and the log holds four events.
- Given run `r1` with three events, and a lock file that can't be removed,
  when `append("r1", 1, [event 2])` is called,
  then it fails with the release error and the log still holds three events.
