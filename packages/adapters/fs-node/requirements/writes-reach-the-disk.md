# fs-node.writes-reach-the-disk

- Status: active
- Since: 0.1.0
- Source: HAL-5215; code review of 11 Nov (HAL-5196)

The stores that replace a file through a temporary file and a rename (the folder definition store, the trust, agent placement, connection settings and unfenced run consent stores, the blob store, run snapshots and record compaction) shall each flush the temporary file to disk before the rename, so that after a power cut the file holds the old text or the new one, never an empty or partial file. The run store and the record store shall flush an append's lines to disk before the append reports success. A rename may still be lost to a power cut, which leaves the old file. Lock files are not flushed: a lock from before a power cut is stale when it is next read.

## Examples

- Given `writer.agent.yaml` holding `old`,
  when the definition store writes `new` to it,
  then the new text is flushed while the file still holds `old`, and renamed over it afterwards.
- Given any of those stores,
  when it writes a record, blob or snapshot,
  then it flushes the file once before renaming it into place.
- Given a run store,
  when `append("r1", 0, [event 1])` succeeds,
  then the event was flushed to disk before the append returned.
