# halonic-run-lock

The run lock the Studio shell shares with the CLI (HAL-2701). While a writer appends to a run, it holds `<runId>.lock` next to the run's log, so a CLI and the desktop app writing one run exclude each other and one of them gets `conflict` instead of both winning. Plain Rust with no Tauri types; the shell's run store wraps it.

The format and every rule are `RunLockRecord`'s in `@halonicjs/ports`, as `withRunLock` in `fs-node` follows them:

- `record_text`: the record a writer puts in the lock, byte for byte as Node's `JSON.stringify` writes it.
- `parse_record`: the record in a lock file, or `None`, taking exactly the JSON Node takes (`1.0` is a whole number, `1.5` and 2⁵³ aren't).
- `is_stale`: whether a lock may be removed: too old or too far in the future, a time that can't be read, or a process that no longer runs on this computer. A file with no record counts by its age only.

## One set of cases for Rust and Node

`tests/fixtures/run-lock-cases.json` holds lock files and whether each is stale, and one record with its exact text. The tests here and `run-lock.test.ts` in `fs-node` read the same file, so both languages judge a lock alike and write the same bytes. A change to it re-runs the `fs-node` tests through that package's `turbo.json`.

Times are read as `Date.parse` reads the forms adapters write: a date, or a date and time with `Z` or an offset like `+01:00`, with `t`, `z` or a space accepted and a day past the month's end (up to 31) running into the next month, as in V8. A time `Date.parse` reads but this crate doesn't (local time without `Z`, `+0100`, six-digit years) counts as unreadable, so the lock is stale at once, as for any time Node can't read. No adapter writes those forms.

The record is JSON, read and written with `serde_json` as `halonic-connect` does.
