# halonic-record-store

The record logs the Studio shell writes (HAL-6175), in the same files as `FileRecordStore` in `fs-node`, so a collection changed on desktop is there for `halonic serve` and `halonic run`, and the other way round. Plain Rust with no Tauri types; the shell's `record_*` commands wrap it, and `TauriRecordStore` in `packages/adapters/fs-tauri` calls them.

- One log per collection in `<profile>/workspaces/<key>/records`, named by the hex SHA-256 of the collection's UTF-16 code units (little-endian) and `.jsonl`: one JSON change per line, only added to until it is compacted. The folder is created with mode `700`, logs with mode `600`.
- Every write holds `write.lock` beside the logs, with `halonic-run-lock` and the `RunLockRecord` rules, so the shell and the CLI take turns. Inside the shell, writes also take turns on one mutex.
- An append writes all of its lines and flushes them, or cuts every log it added to back to its size before, the last one first. It names each collection once; one named twice is refused before anything is written. A torn last line a crash left is left out on read and cut off before the next append.
- A log that is a symbolic link (also one to nothing), a hard link (on Unix) or not a plain file is refused on read, append and replace, without writing through it or opening a named pipe.

## What stays in the page

This crate does only the file work. The page keeps the rest in TypeScript, shared with `fs-node` through the `RecordStore` port: `formatRecordLines`, `parseRecordLines`, and the fold a compact writes (`compactedChanges`). So this side checks only what keeps the files readable: that the lines to write are whole lines, each a JSON object whose `collection` is the log's. It doesn't check the rest of a change, as `parseRecordLines` does on read; that holds while the page writes the lines with `formatRecordLines`.

A compact is two calls: `read` gives the whole lines and their version (their hex SHA-256); the page folds them and calls `replace` with that version. Under the write lock, `replace` writes the new log through a flushed temporary file and a rename, or removes the log when there are no lines left, but only while the log still has that version. Otherwise it answers `Changed` and writes nothing, and the page reads again. So an append is never lost to a compact.

## API

- `RecordFolders::new(computer)`: what every lock is judged against, and one write at a time inside the shell. The shell keeps one.
- `folder(root)`: one record folder. The shell works the path out; the page never names one.
- `append(&[CollectionLines])`, `read(collection)`, `replace(collection, version, lines)`. A write gives `Written { outcome, release_error }`: a lock that couldn't be released after the write is only logged, since the write stands and a retry would store it twice.

The requirement in `requirements/` is a draft until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves: `record_store_`.
