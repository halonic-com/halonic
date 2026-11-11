# watch-kit.own-change

- Status: active
- Since: 0.1.0
- Source: HAL-3335, HAL-5766

When a store runs one of its own writes or removes through `runOwnChange`, the kit shall mark it on every watch open at the start, before the change begins, so none of them reports it. When the change says it left the file alone because it found a change from outside, the watches shall drop the mark without reading the file, so the next batch still reports that change. When the change throws, the watches shall read the file back and the error shall go on to the store's caller. When no watch is open, the kit shall work out no digest.

## Examples

- Given a watch on `a.yaml` holding `1`,
  when the store writes `2` through `runOwnChange`,
  then the next batch is empty.
- Given a watch on `a.yaml` holding `1`,
  when another program writes `3` and the store's change finds it and leaves the file alone,
  then the next batch holds `a.yaml changed`.
- Given no open watch,
  when the store writes through `runOwnChange`,
  then no digest is worked out.
