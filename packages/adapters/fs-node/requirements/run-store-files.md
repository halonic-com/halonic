# fs-node.run-store-files

- Status: active
- Since: 0.1.0
- Source: HAL-1635; run storage as decided on HAL-1503

The folder run store shall keep each run as `<runId>.jsonl` in the root folder it is given, one event per line, and only ever add to it. With `AppendOptions.snapshot` it shall write `<runId>.snapshot.json` beside the log, through a temporary file and a rename. It shall work out the run list from the logs on every call, so deleting a log removes the run, and a new run with the same id shall not inherit the old run's snapshot. Appends to one run shall go one at a time and honor `expectedSeq`. It shall refuse with a `RangeError` a run id that is not 1 to 128 letters, digits, `_`, `-` or `.`, starts with a dot, or is a Windows device name.

## Examples

- Given run `r1` with three events,
  when `append("r1", 3, [event 4], { snapshot: { step: 4 } })` is called,
  then `r1.jsonl` holds four lines and `r1.snapshot.json` holds `{ seq: 4, state: { step: 4 } }`.
- Given runs `r1` and `r2`,
  when `r2.jsonl` is deleted,
  then `list()` gives only `r1`, and `get("r2")` and `snapshot("r2")` give `null`.
- Given any store,
  when `events("../r1")` is called,
  then it throws a `RangeError`.
