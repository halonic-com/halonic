# fs-tauri.collections-persist

- Status: draft
- Since: 0.1.0
- Source: HAL-110 stub (HAL-10 migration checklist P5: collections work on desktop); HAL-6175; where the files go: HAL-119 (the CLI's rule, one shared function) and HAL-2022 G4 (nothing of a workspace's data in the workspace); `FileRecordStore` in `fs-node`; `ports.record-log-files`, `ports.record-fold`; `RecordStore` port v2

When a collection record changes on desktop, the desktop store shall append the change to the collection's log where the CLI keeps it, in the same format and under the same write lock, so the records are still there after the app restarts and `halonic` reads them: `<profile>/workspaces/<key>/records/<SHA-256 of the collection>.jsonl`, the folder `recordsFolder` in `@halonicjs/profile` names, one change per line, as `FileRecordStore` keeps it. (The stub said `.studio/collections/<collection>.jsonl` inside the workspace; HAL-119 and HAL-2022 G4 moved a workspace's data into the profile.)

The Tauri record store shall implement `RecordStore` and pass its contract suite by calling the shell's `record_append`, `record_read` and `record_replace` commands, naming the record folder only by the workspace it was made for and the collection, never by a path. It shall write changes as log lines and read them back with the port's rules (`formatRecordLines`, `parseRecordLines`), sending one call per append with each collection's lines. A compact shall read the log with its version, fold it with `compactedChanges`, and ask the shell to replace the log only at that version; when the log changed in between, it shall read and fold again, and after five tries reject with a `conflict` error, so a change appended during a compact is never lost. When the shell refuses a workspace that isn't open in it, the call shall reject with a `denied` error; a broken or linked log with an `Error` holding the shell's message; lines the page should have written whole with an `internal` error; an `io` refusal with an `unavailable` error that keeps the shell's message. A rejection that isn't the shell's refusal shape, or an answer that isn't the command's, shall reject with an `unavailable` error that doesn't repeat its text.

## Examples

- Given collection "orders" and a run that adds record "o-1",
  when the app is closed and reopened on the same folder,
  then "orders" still contains "o-1".
- Given the same folder opened by `halonic serve`,
  when "orders" is read,
  then it contains "o-1".
- Given a compact of "orders" that read the log, and a change "o-2" appended before its replace,
  when the compact finishes,
  then "orders" holds seeds for "o-1" and "o-2".
- Given the served Studio, which has no capability for the record commands,
  when any method is called,
  then it rejects with an `unavailable` error that doesn't hold the shell's text.
