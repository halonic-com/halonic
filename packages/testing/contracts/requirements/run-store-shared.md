# contracts.run-store-shared

- Status: active
- Since: 0.1.0
- Source: HAL-2373; HAL-191 run-storage decisions (C53) 6 and 7; `RunLockRecord` in the `RunStore` port

Where a `RunStore` adapter's stores can share one storage across processes, such as a run folder that a CLI and a desktop app both write to, two stores on one storage shall keep the `expectedSeq` guarantee between them: of two writers with the same `expectedSeq`, exactly one shall win and the other shall get a conflict with the new `lastSeq`. A lock left behind by a writer that crashed, from a process on this computer that no longer runs or taken longer ago than `runLockStaleAfterMs`, shall not block the run: the next append shall succeed and release the lock again.

## Examples

- Given two stores on one folder and run `r1` with event 1,
  when both append event 2 at the same time,
  then one gets `ok: true` and the other `{ ok: false, reason: "conflict", lastSeq: 2 }`.
- Given run `r1` with event 1 and a lock on it from a process that no longer runs,
  when a store appends event 2,
  then it gets `{ ok: true, lastSeq: 2 }`, and another store can append event 3.
