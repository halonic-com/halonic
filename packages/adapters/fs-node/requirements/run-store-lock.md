# fs-node.run-store-lock

- Status: active
- Since: 0.1.0
- Source: HAL-2373; HAL-191 run-storage decisions (C53) 6; `RunLockRecord` in the `RunStore` port

The folder run store shall hold `<runId>.lock` while it checks `expectedSeq` and writes an append, created with an exclusive create and holding a `RunLockRecord` as JSON: the format version, its process id, the host name and when it was taken. It shall wait while another live writer holds the lock, remove a stale lock as the port's rules allow, and remove its own lock after the append, a conflict or a failed write. A lock file that holds no record shall count as stale only once its file is older than `runLockStaleAfterMs`.

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
