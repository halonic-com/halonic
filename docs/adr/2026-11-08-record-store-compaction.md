# A record store can remove a value from disk

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

The `RecordStore` keeps every collection as a log of changes and only
appends. A value that is overwritten or removed stays in the log. For
`_tokens` that means an old refresh token, and soon the Google client
secret, stays on disk, still encrypted with the token key. Anyone who gets
the token key and the log later can read it again. Studio therefore can't
honestly say a secret is "removed from this computer". The security review
in HAL-705 (plan D1) asks for a way to drop it.

## Decision

**`RecordStore` gets a required `compact(collection)`, and the port goes
to version 2.** Afterwards `changes(collection)` gives one `seed` per
current record with its current values, the `at` of its last change and
no `by`. Removed records are gone completely; other collections stay as
they are.

**There is one fold, `foldRecords`, in the port file.** It turns changes
into current records the way every reader already did: `add` and `seed`
set all values, `update` merges, `remove` drops the record. Compaction and
readers use it, so a compacted log always reads the same as the log it
replaced.

**The token store compacts `_tokens` after every replace and remove.**
Other collections compact when their owner decides; nothing does it on a
timer yet.

The method is required, not optional: an optional method would let an
adapter keep old secrets on disk without anyone noticing.

## Consequences

- Every `RecordStore` adapter and test double implements `compact`, and the
  `record-store` contract checks that no overwritten or removed value is
  left in `changes()`.
- A compacted collection loses its history: who changed a record and when
  is gone, apart from the time of each record's last change.
- An adapter on a file or a database has to replace the log in one step,
  so a crash in the middle leaves either the old log or the new one.
- Several processes or server instances can share one store, so a change
  appended while a compact runs is either folded into the seeds or kept
  after them, never lost. An adapter on a file or a database reads, folds
  and replaces the log in one transaction or under the store's write lock.
- Compaction removes a value only from the store's own storage. Backups,
  copies and freed disk blocks are outside the port.

## Changed from an earlier decision

[The first port list](2026-11-07-port-list-and-versions.md) had
`RecordStore` unchanged from the old repo at version 1, with `append` and
`changes` only.
