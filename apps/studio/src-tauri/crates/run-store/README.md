# halonic-run-store

The run folders the Studio shell writes (HAL-2701), in the same files as `FolderRunStore` in `fs-node`, so a CLI and the desktop app can write one run folder. Plain Rust with no Tauri types; the shell's `run_*` commands wrap it.

- `<runId>.jsonl` holds the run's events, one JSON line each, and only ever grows. Whatever follows the last line break is a line a crash cut off: it is left out, and cut off before the next append. Only an append that goes ahead cuts it: a conflict leaves the log as it is.
- `<runId>.snapshot.json` caches the engine's state. It is replaced through a temporary file and a rename, and a new run (`expectedSeq` 0) drops one left from a deleted log.
- `<runId>.lock` is held while an append checks `expectedSeq` and writes, with `halonic-run-lock`, so of two writers with the same `expectedSeq` exactly one wins.

## What stays in the page

This crate does only the file work. The page keeps everything else in TypeScript, shared with `fs-node` through the `RunStore` port: `checkRunAppend`, writing events as lines (`formatLogLines`), reading lines back into events (`parseLogLines`), the snapshot's `seq`, and the summaries `list` works out. So this side checks only what keeps the files safe:

- the run id, with the port's rule (`checkRunId`), because it names the files;
- that the lines to append are whole, non-empty lines, each ending in a line break, because it counts one event per line to check `expectedSeq`;
- that a log's whole lines are UTF-8 text, with the same message as `fs-node`.

## API

- `RunFolders::new(computer)`: what every lock is judged against, and one turn at a time per run inside the shell, as `KeyedQueue` gives `fs-node`. The shell keeps one.
- `folder(root)`: one run folder, `<profile>/workspaces/<key>/runs` or a deployment's. The shell works the path out; the page never names one. A relative `root` is made absolute against the current folder, as `resolve(root)` in `fs-node`.
- `append(runId, expectedSeq, lines, snapshot)`: `Appended { lastSeq }` or `Conflict { lastSeq }`. A snapshot that can't be written doesn't fail the append; the error comes back for the shell to log. Nor does a lock that can't be released once the lines are stored: a retry would get `Conflict` with its own events in the log. That error comes back too, and the lock left behind goes stale after 10 seconds.
- `events(runId)`: the log's whole lines, empty for a run with no log.
- `snapshot(runId)`: the snapshot's text and how many events the log holds, so the page drops a snapshot ahead of the log.
- `logs(known)`: every run's stamp (the log's size and modification time) and lines, sorted by run id, for the page's `list`. A log whose stamp is still the one in `known` isn't read: its lines are `None`, and the page keeps what it worked out from them (HAL-5545).

Unlike `fs-node`, an append reads the whole log again to find its last event instead of remembering where it ended. That keeps this side simple; it can learn the same cache when logs get long.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves: `run_store_`.
