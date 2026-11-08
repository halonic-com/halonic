# contracts.run-store

- Status: active
- Since: 0.1.0
- Source: HAL-114; plan 4.3; `RunStore` port v1; old `784f78d:packages/testing/port-contracts` `runStoreContract`

Every `RunStore` adapter shall append events only when the run's last stored event is `expectedSeq`, return `ok` with the new `lastSeq`, and otherwise return a conflict with the current `lastSeq` and store nothing. Of two writers with the same `expectedSeq`, exactly one shall win. It shall store a snapshot in the same write as its events, keep the latest one, and store none when the append conflicts. It shall give a run's events oldest first (only those after `afterSeq` when given), an up-to-date summary from `get`, and from `list` the summaries that match every filter field, newest start first. It shall keep its own copy of the events. When the events are empty, misnumbered or for another run, or `expectedSeq` isn't a whole number of 0 or more, `append` shall reject with a `RangeError`, never a conflict, and store nothing.

## Examples

- Given run `r1` with events 1 and 2,
  when a writer appends at `expectedSeq` 1,
  then it gets `{ ok: false, reason: "conflict", lastSeq: 2 }` and the log still has 2 events.
- Given run `r1` with event 1,
  when two writers append event 2 at the same time,
  then one gets `ok: true` and the other a conflict with `lastSeq` 2.
- Given an append with `{ snapshot: { step: 2 } }` that ends at event 2,
  when the snapshot is read after a later append without one,
  then it is `{ seq: 2, state: { step: 2 } }`.
- Given a running, a waiting and a failed run,
  when the list is filtered by `status: ["running", "waiting"]`,
  then it gives the first two, newest start first.
- Given `append("r1", 1, [])`,
  when it is called,
  then it rejects with a `RangeError`.
