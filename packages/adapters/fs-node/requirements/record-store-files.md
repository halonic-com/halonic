# fs-node.record-store-files

- Status: active
- Since: 0.1.0
- Source: HAL-3298; decision C254 on HAL-3295; ADR 2026-11-08 (record store compaction); HAL-2978; HAL-3009; `RecordStore` port v2

The file record store shall keep each collection as one log in the folder it is given, named by the lower-case hex SHA-256 of the collection name as UTF-16 code units (little-endian) and `.jsonl`, with one change per line, and only add to it until it is compacted. It shall create the folder with mode `700` and each log with mode `600`. Every append and compact, in any process, shall hold the store's write lock (`write.lock`, with the `RunLockRecord` rules), and a compact shall read, fold and replace the log under it, writing the new log to a temporary file, flushing it and renaming it over the old one, and deleting the log when no record is left. A change shall count once its line break is written: a torn last line shall be skipped on read and cut off before the next append. An append that fails shall cut every log it added to back to its size before. A complete line that isn't a change to the log's own collection shall be an error naming the file and line. A log that is a symbolic link, even one to nothing, a hard link (a file with more than one name), or not a plain file, such as a named pipe, shall be refused on read, append and compact, without writing through it or waiting on a named pipe.

## Examples

- Given an append to `leads` and to `Leads`,
  when the folder is read,
  then it holds two logs, each named by the SHA-256 of its collection, and `write.lock` is gone.
- Given a log for `leads` whose last line was cut off by a crash,
  when `leads` is read and then a change is appended,
  then the read gives only the whole lines, and afterwards the log holds the old whole lines and the new change.
- Given a log for `leads` whose first line holds a change to `orders`,
  when `leads` is read,
  then it throws naming the file and line 1.
- Given `leads` with records added and removed until none is left,
  when `leads` is compacted,
  then its log is gone and its changes are `[]`.
- Given the log for `leads` is a symbolic link or a hard link to a log outside the folder,
  when `leads` is read, appended to or compacted,
  then it throws, and the file outside is unchanged.
- Given another process holds the write lock,
  when a change is appended,
  then the append waits until the lock is released.
