# fs-node.run-store-lock

- Status: active
- Since: 0.1.0
- Source: HAL-2373; HAL-3897; HAL-4062; HAL-191 run-storage decisions (C53) 6; `RunLockRecord` in the `RunStore` port

The folder run store shall hold `<runId>.lock` while it checks `expectedSeq` and writes an append, created with an exclusive create and holding a `RunLockRecord` as JSON: the format version, its process id, the host name and when it was taken. It shall wait while another live writer holds the lock, remove a stale lock as the port's rules allow, and remove its own lock after the append, a conflict or a failed write. A lock file that holds no record shall count as stale only once its file is older than `runLockStaleAfterMs`. Only one writer at a time shall remove a stale lock: the one that creates `<runId>.lock.takeover` with an exclusive create. Holding it, the writer shall read the lock again and remove it only while it still holds the same stale text, and never move or remove a lock that isn't stale. A takeover file older than `runLockTakeoverStaleAfterMs` shall count as left by a crashed writer and may be removed (HAL-4062). When the lock or takeover path is a symbolic link to a file that isn't there, taking the lock shall fail with an error instead of trying again for ever. On Windows, while taking or removing the lock, it shall treat `EPERM` and `EBUSY` as the lock file being busy right now, because another writer is deleting it or another program has it open, and try the step again every 15 milliseconds for up to 2 seconds before it fails with the error (HAL-3897). On other systems these errors shall fail at once.

## Examples

- Given run `r1` with three events and a fresh lock held by a running process,
  when `append("r1", 3, [event 4])` is called,
  then it waits, and succeeds once the lock is removed.
- Given an empty `r1.lock` last changed a minute before the stale limit ran out,
  when `append("r1", 3, [event 4])` is called,
  then it succeeds.
- Given an append, a conflicting append and an append whose write fails,
  when they have settled,
  then the folder holds only `r1.jsonl`.
- Given Windows and a lock another writer is deleting,
  when the store takes the lock and the create fails with `EPERM`,
  then it tries again and takes the lock once the file is gone.
- Given a stale `r1.lock` and three writers, where the second has read the stale lock when the first removes it and takes its own,
  when all three append,
  then only one of them holds the lock at any moment.
- Given `r1.lock` is a symbolic link to a file that isn't there,
  when `append("r1", 3, [event 4])` is called,
  then it fails with an error that names the link.
