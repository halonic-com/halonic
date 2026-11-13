# cloudflare-durable.run-log

- Status: active
- Since: 0.1.0
- Source: HAL-6796; build plan part 6 (HAL-197); design review HAL-6790 (Elena, 12 Nov); `RunStore` port v1

The Cloudflare run object shall keep each run's event log in its own SQLite storage, append events only when the log's last event is `expectedSeq`, and store the events together with their snapshot in one transaction, so that of two writers with the same `expectedSeq` exactly one wins and a conflict stores nothing. It shall give back its own copy of the events, the latest snapshot, and nothing for a log that is empty. It shall leave out a snapshot too large for a SQLite row (2 MB) and still store the events.

## Examples

- Given a log with events 1 and 2,
  when a writer appends at `expectedSeq` 1,
  then it gets a conflict with `lastSeq` 2 and the log still has 2 events.
- Given an append of event 2 with a snapshot, that conflicts,
  when the snapshot is read,
  then it is the one stored before, or none.
- Given an append whose snapshot is over 2 MB,
  when it is made,
  then the events are stored, `ok` is true, and the snapshot is the earlier one.
