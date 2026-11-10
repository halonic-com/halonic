# studio.src-tauri.crates.run-store.run-store

- Status: draft
- Since: 0.1.0
- Source: HAL-2701; `FolderRunStore` in `fs-node`; `contracts.run-store-shared`; `ports.run-log-files`

The shell shall keep a run in the run folder's files as `fs-node` keeps them: `<runId>.jsonl` with one event per line, `<runId>.snapshot.json` replaced through a temporary file and a rename, and `<runId>.lock` held with `halonic-run-lock` while an append checks `expectedSeq` and writes. It shall append whole lines only when the log's last event is `expectedSeq`, and otherwise store nothing and give the conflict with the log's last event. It shall leave out a torn last line when reading, and cut it off before appending. If the run id breaks the `RunStore` port's rule, the lines to append are not whole lines, or the log's whole lines are not UTF-8 text, then the shell shall refuse without writing anything.

## Examples

- Given two stores on one folder and run `r1` with event 1,
  when both append event 2 at the same time,
  then one gets `Appended { lastSeq: 2 }` and the other `Conflict { lastSeq: 2 }`.
- Given run `r1` with event 1 and a lock on it from a process on this computer that no longer runs,
  when a store appends event 2,
  then it is appended, and another store can append event 3.
- Given a log whose last line has no line break,
  when the shell appends the next event,
  then the torn line is cut off first.
- Given a snapshot that can't be written,
  when the shell appends with it,
  then the events are stored and the snapshot's error is given back.
- Given run id `../r1` or `NUL.jsonl`, or lines `{}` without a line break,
  when the shell appends,
  then it refuses and creates nothing.
