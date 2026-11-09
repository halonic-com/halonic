# A run's snapshot is a cache, and only a crash can store part of an append

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

[The port list](2026-11-07-port-list-and-versions.md) says `RunStore.append`
stores the engine's state snapshot in the same write as the events. A store
in one folder of files (`FolderRunStore` in `adapter-fs-node`) can't do that
in one step: the log is one file and the snapshot another, and the file
system has no transaction across both. A crash can also stop an append after
its first events reach the disk. We looked at a marker field on events, so a
reader can tell a whole batch from a cut one, and chose not to add it to the
event format for this.

## Decision

**The snapshot is a cache.** An adapter may store the events and drop the
snapshot when writing it fails. `snapshot(runId)` then gives an older one or `null`, and the engine
replays the log. A snapshot that is missing, unreadable or ahead of the log
also gives `null`.

**An append that fails or gives a conflict stores none of its events.** Only
a crash of the program in the middle of an append may leave the first events
of a batch stored, in an adapter that writes to disk. The `RunStore` port doc
and that adapter's readme say so.

The port version doesn't change: no method or type changes, and an adapter
that stores both together still follows the port.

## Consequences

- The log stays the only source of truth, as in
  [runs are stored separately](2026-11-08-runs-are-stored-separately.md).
- The engine (HAL-186) copes with a log that ends partway through a batch
  after a crash.
- The `RunStore` contract suite still checks that a normal append keeps its
  snapshot and that a conflict stores none. `adapter-fs-node` tests a failed
  append, a failed snapshot write and a stale, missing or ahead snapshot.
- `FolderRunStore`'s append lock holds within one process only. Running
  `halonic run` and `halonic serve` on the same folder needs a cross-process
  lock or a single writer (HAL-191).

## Changed from an earlier decision

[The port list](2026-11-07-port-list-and-versions.md) had the snapshot stored
in the same write as the events. It is now a cache an adapter may drop.
