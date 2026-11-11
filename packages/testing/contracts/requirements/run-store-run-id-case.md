# contracts.run-store-run-id-case

- Status: active
- Since: 0.1.0
- Source: HAL-4749; agreed with QA on HAL-4761; `RunStore` port v1

Where an adapter implements `RunStore`, it shall treat run ids that differ only in case as different runs, on every system: reading one shall never give the other's events, snapshot or summary, and appending to one shall never change the other or return a conflict from the other's log. An adapter that can't keep the two apart (a folder that ignores case) shall reject the append with the error kind `invalid_input`; one that can shall store a separate run that `list` gives beside the other.

## Examples

- Given run `run_x` with two events and a snapshot,
  when `events("RUN_X")`, `snapshot("RUN_X")` and `get("RUN_X")` are called,
  then they give `[]`, `null` and `null`.
- Given run `run_x` with two events and a snapshot,
  when `append("RUN_X", 0, [event 1])` is called,
  then it gives `{ ok: true, lastSeq: 1 }` and `list()` holds both runs, or it rejects with `invalid_input`;
  either way `run_x` keeps its events, snapshot and summary.
