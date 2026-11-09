# ports.run-store-checks

- Status: active
- Since: 0.1.0
- Source: HAL-1635; the append checks and the list filter moved from the memory adapter so the folder adapter shares them

The ports package shall export the rules of the `RunStore` port, so every adapter applies the same ones. `checkRunAppend` shall throw a `RangeError` for an append the port calls the caller's bug. `matchesRunFilter` shall say whether a summary matches every field of a filter, with an empty status list as no status filter. `compareRunSummaries` shall order summaries newest start time first, then by run id.

## Examples

- Given an append to `r1` with `expectedSeq` -1, no events, an event of `r2` or a gap in the numbers,
  when `checkRunAppend` is called,
  then it throws a `RangeError`.
- Given a waiting run of hub `a`,
  when it is matched against `{ hubId: "a", status: [] }` and `{ status: ["running", "waiting"] }`,
  then both match, and `{ kind: "test" }` doesn't.
- Given runs `b` and `a` started at the same time and run `c` started later,
  when they are sorted with `compareRunSummaries`,
  then the order is `c`, `a`, `b`.
