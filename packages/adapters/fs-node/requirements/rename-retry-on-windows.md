# fs-node.rename-retry-on-windows

- Status: active
- Since: 0.1.0
- Source: HAL-3369; Liam's review of PR #942 (HAL-3311); HAL-3548; HAL-4075; HAL-6758

When a store that writes through a temporary file renames it over a file on Windows (the folder definition store, the blob store, the trust store, the agent placement store, the connection settings store, the unfenced-run consent store, the record store when it compacts a log, and the folder run store for a run's snapshot) and the rename fails with `EPERM` or `EBUSY`, because another program such as an antivirus scanner, an editor or the search indexer briefly holds the file open, or a program such as Studio keeps reading it, the store shall try the rename again up to fifteen times, waiting 10, 20, 40 and 80 milliseconds before the first four new tries and 160 milliseconds before each of the eleven after them, 1.91 seconds in all. When the last try fails too, the write shall fail with that error and remove its temporary file. Any other error, and every error on other systems, shall fail the write at once. A failed snapshot write doesn't fail the run store's append: as for any snapshot error, the events stay stored, the older snapshot stays and the error goes to `onSnapshotError`. A compact keeps the record store's write lock while it retries, so an append that waits on it lands on the compacted log, or on the old log when the compact fails.

Moving a stale run lock aside is not such a rename and is not retried this way: a retry there could hide a live holder.

## Examples

- Given Windows and a file held open for the first two tries,
  when the rename runs,
  then it waits 10 and then 20 milliseconds and succeeds on the third try.
- Given Windows and a file that stays held,
  when the rename runs,
  then it tries sixteen times, waits fifteen times, and fails with the last `EBUSY`.
- Given Linux and a rename that fails with `EPERM`,
  when the rename runs,
  then it fails at once without waiting.
- Given Windows and a rename that fails with `ENOENT`,
  when the rename runs,
  then it fails at once without waiting.
- Given Windows and a run snapshot that stays held,
  when an append with a snapshot runs,
  then the events are stored, the older snapshot stays and `onSnapshotError` gets the last `EBUSY`.
- Given Windows, a log held open for the first two tries of a compact and an append that waits on the compact,
  when both run,
  then the compact succeeds on the third try and the append lands after the compacted changes.
- Given Windows, a log that stays held during a compact and an append that waits on the compact,
  when both run,
  then the compact fails with the last `EBUSY`, the old log stays and the append lands on it.
