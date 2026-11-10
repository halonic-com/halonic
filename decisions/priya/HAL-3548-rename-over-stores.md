# Decision: the trust, placement and run stores retry a held rename on Windows too

- Approval: Liam asked for this in his review of #1028 ([HAL-3545](/HAL/issues/HAL-3545)), follow-up [HAL-3548](/HAL/issues/HAL-3548); the package owner approves this note in review
- Kind: internal
- Task: HAL-3548

## What changes

`fs-node.rename-retry-on-windows` named only the folder definition store. It now names the trust
store, the agent placement store and the folder run store's snapshot write as well. It says a
snapshot that stays held still doesn't fail the append (the error goes to `onSnapshotError`, as
for any snapshot error), and that moving a stale run lock aside is not retried this way. One new
example covers the held snapshot.

## Why

These stores write the same way, a temporary file renamed over the file, so on Windows a scanner
or indexer that briefly holds the file failed a trust grant, a placement save or a snapshot. The
retry fixes that. Nothing that worked before changes: on other systems, and on Windows when the
file isn't held, the stores behave as they did. The stale lock is left alone because a retry there
could hide a live holder.

## Covers

- fs-node.rename-retry-on-windows
