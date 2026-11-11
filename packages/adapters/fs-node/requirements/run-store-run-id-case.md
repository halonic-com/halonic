# fs-node.run-store-run-id-case

- Status: active
- Since: 0.1.0
- Source: HAL-4749, after HAL-4695 (#1533); `contracts.run-store-run-id-case`

Where the file system ignores case and `<runId>.jsonl` opens the log of a run whose id differs only in letter case, the folder run store shall reject an append under that id with the error kind `invalid_input`, never a conflict, before anything is changed. When the log has no whole line to tell whose it is (a crash on a run's first write), the store shall tell it by the folder's names, and it shall list the folder only when that file is there.

## Examples

- Given run `run_x` on a case-insensitive file system,
  when `append("RUN_X", 0, [event 1])` is called,
  then it rejects with `invalid_input`.
- Given a log `run_x.jsonl` with only half a line,
  when `append("RUN_X", 0, [event 1])` is called,
  then it rejects on a case-insensitive file system, and stores `RUN_X.jsonl` beside it on one that tells case apart.
