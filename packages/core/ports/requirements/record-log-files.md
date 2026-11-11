# ports.record-log-files

- Status: active
- Since: 0.1.0
- Source: HAL-6175 (the desktop app's record store shares the CLI's record logs); the line rules moved from `fs-node` so `fs-tauri` shares them, as `ports.run-log-files` did on HAL-2701; `RecordStore` port v2

The ports package shall export the record log's line rules, so every adapter that keeps collections as files reads and refuses the same logs. `formatRecordLines` shall write each change as one JSON line ending in a line break. `parseRecordLines` shall read a log's whole lines back into changes, throw an error naming the file and line for a line that isn't JSON, isn't a record change with the port's field types, or holds a change to another collection, and throw a `RangeError` for text that doesn't end in a line break, since leaving out a torn last line is the adapter's job.

## Examples

- Given the lines `formatRecordLines` wrote for an `add` and a `remove` in `leads`,
  when they are read with `parseRecordLines` for `leads`,
  then it gives both changes.
- Given one whole line and a last line without a line break,
  when they are read with `parseRecordLines`,
  then it throws a `RangeError`.
- Given a first line that holds a change to `orders`,
  when the log of `leads` is read,
  then it throws an error naming the file and line 1.
