# ports.definition-store-watch

- Status: active
- Since: 0.1.0
- Source: save model 6.1 (HAL-1102), HAL-396 files 2.1, routing note task 3 (HAL-3236), HAL-3247; `DefinitionStore` port v2

While a watch is open, the `DefinitionStore` port shall report the workspace files that change from outside Halonic as batches of `{ path, kind }`, each path at most once and sorted, where `kind` is `changed` or `removed`. A change is a file whose text differs from what the store last saw: the store's own writes and removes, a file saved again with the same text, and private entries shall not be reported. A file removed and created again shall be `changed`, and a folder that goes away shall give one `removed` per file that was in it. Once `close()` resolves, nothing more shall be reported. When the watch breaks, the store shall tell the listener's `failed` and report nothing more.

## Examples

- Given a watch,
  when `git checkout` changes 50 files within a moment,
  then the listener gets one batch of 50 `changed`.
- Given a watch,
  when Halonic writes `a.yaml` and another editor writes `c.yaml`,
  then the batch holds only `c.yaml changed`.
- Given a watch,
  when an editor saves `a.yaml` by removing it and writing a new one,
  then the batch holds `a.yaml changed`, not `removed`.
- Given a watch,
  when `.git/index`, `.studio/runs/r1.jsonl` or `.env` changes,
  then nothing is reported.
- Given a watch on a store in memory,
  when a test calls `changeOutside({ "a.yaml": "2", "b.yaml": null })`,
  then the listener gets `a.yaml changed` and `b.yaml removed` as one batch.
