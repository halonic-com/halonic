# Decision: every store that renames over a file retries a held rename on Windows

- Approval: Liam asked for this in his review of #1259 (HAL-4068), follow-up HAL-4075; the package owner approves this note in review
- Kind: internal
- Task: HAL-4075

## What changes

`fs-node.rename-retry-on-windows` now lists every store that writes through a temporary file and
renames it over a file: besides the folder definition store, the trust store, the agent placement
store and the run store's snapshot, it names the blob store and the unfenced-run consent store
(which already retried) and the connection settings store and the record store's compact (which
now retry too). It says a compact keeps the record store's write lock while it retries, so an
append that waits on it lands on the compacted log, or on the old log when the compact fails. Two
new examples cover the compact.

## Why

The connection settings store and the compact wrote the same way as the other stores, a
temporary file renamed over the file, so on Windows a scanner or indexer that briefly held the file
failed a save or a compact. The retry fixes that. Nothing that worked before changes: on other
systems, and on Windows when the file isn't held, the stores behave as they did. The list names
the stores one by one, so a reader sees which ones are covered; the stale run lock stays outside
it, as before.

## Covers

- fs-node.rename-retry-on-windows
