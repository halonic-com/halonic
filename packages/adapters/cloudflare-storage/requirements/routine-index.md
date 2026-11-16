# cloudflare-storage.routine-index

- Status: active
- Since: 0.1.0
- Source: HAL-11277, built on the decision of HAL-11270 (option 1); the plan Liam approved on HAL-11277

The snapshot writer shall upload the routine index, `routines.index.json`, together with the workspace files: the placed routines (each routine with the hub its file sits in) of the same loaded workspace the files come from, so the two never differ. The index is listed in the manifest with its hash like a file, so it is checked as any file is, and it is left out of `list`. It shall hold nothing the routine files don't hold: a webhook's secret stays its name, never a value. The writer shall refuse a workspace file at the index's own path with a `RangeError`. `readRoutineIndex` shall check the index against the routine schema of `@halonicjs/format/routine` and fail with a `DefinitionSnapshotError` when the index is missing, isn't JSON or doesn't fit, so the Worker finds the routines a webhook can start without reading YAML. The manifest's format is 2: a snapshot in format 1 shall fail with a message that says to run `halonic deploy` again, and a newer one with a message that says to update Halonic.

## Examples

- Given a workspace with a `.env` file and a routine whose webhook names a secret,
  when it is uploaded with its routines,
  then the secret's value is in no object, and the index holds the secret's name.
- Given routines written with a snapshot,
  when `readRoutineIndex` reads the snapshot,
  then it returns the same routines.
- Given a snapshot with no index, or an index that isn't valid,
  when `readRoutineIndex` reads it,
  then it fails with a `DefinitionSnapshotError`.
- Given a snapshot in format 1,
  when it is read,
  then it fails with a `DefinitionSnapshotError` that says to run `halonic deploy` again.
