# memory.dry-run-run-store

- Status: active
- Since: 0.1.0
- Source: HAL-1662; point 3 of the Docker research (HAL-1600), approved on HAL-1649; Compose's `pkg/dryrun`

The dry-run run store shall read through to the run store it wraps and shall never append to it. When asked to append, it shall apply the same rules as the port: refuse a caller's bug with a RangeError, and give `conflict` unless `expectedSeq` is the last event it knows of for that run, real or pending. Once a run has a pending append, the dry run shall read only the real events and snapshot up to the run's last real event at that first append, so events another writer adds later don't mix into its view. An append that succeeds shall be kept in memory, shown to later reads of the run's events, snapshot, summary and the run list, and recorded, so `changes()` returns every successful append in the order asked. It shall pass the `RunStore` contract suite.

## Examples

- Given a dry run over a store where run `r1` has one event,
  when the caller appends event 2 to `r1` and starts run `r2`,
  then the dry run reads events 1 and 2 for `r1` and lists both runs, the wrapped store still holds only event 1 of `r1`, and `changes()` reports the two appends in order.
- Given a dry run over a store where run `r1` has one event,
  when the caller appends to `r1` expecting sequence number 0,
  then the append gives `conflict` with `lastSeq` 1 and nothing is recorded.
- Given a dry run that appended event 2 to run `r1`,
  when another writer appends events 2 and 3 to `r1` in the wrapped store,
  then the dry run still reads events 1 and 2 for `r1`, its own event 2 last, and shows no snapshot taken after event 1.
