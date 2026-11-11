# studio.src-tauri.crates.record-store.record-store

- Status: draft
- Since: 0.1.0
- Source: HAL-6175; `FileRecordStore` in `fs-node` and `fs-node.record-store-files`; `ports.record-log-files`; `fs-tauri.collections-persist`

The shell shall keep each collection as `fs-node` keeps it: one log in the record folder, named by the lower-case hex SHA-256 of the collection name as UTF-16 code units (little-endian) and `.jsonl`, with one change per line, the folder created with mode `700` and each log with mode `600`. Every append and replace shall hold the store's write lock (`write.lock`, with the `RunLockRecord` rules). An append shall write all of its lines and flush them, or fail and cut every log it added to back to its size before. A torn last line shall be skipped on read and cut off before the next append. It shall refuse lines that aren't whole lines of JSON objects naming the log's own collection, and an append that names one collection twice, before writing anything. A replace shall write the new log to a temporary file, flush it and rename it over the old one, or delete the log when no lines are left, and only while the log's whole lines still have the version the page read; otherwise it shall write nothing and say the log changed. A log whose whole lines aren't UTF-8 shall be an error naming the file. A log that is a symbolic link, even one to nothing, a hard link, or not a plain file shall be refused on read, append and replace, without writing through it.

## Examples

- Given an append to `leads` and to `Leads`,
  when the folder is read,
  then it holds two logs, each named by the SHA-256 of its collection, and `write.lock` is gone.
- Given a log for `leads` whose last line was cut off by a crash,
  when `leads` is read and then a change is appended,
  then the read gives only the whole lines, and afterwards the log holds the old whole lines and the new change.
- Given `leads` read at one version and a change appended after,
  when the page replaces `leads` at the version it read,
  then nothing is written and the replace says the log changed.
- Given an append that names `leads` twice,
  when it is appended,
  then it is refused as `invalid_lines` and nothing is written.
- Given another process holds the write lock,
  when a change is appended,
  then the append waits until the lock is released.
- Given the log for `leads` is a symbolic link or a hard link to a log outside the folder,
  when `leads` is read, appended to or replaced,
  then it is refused, and the file outside is unchanged.
