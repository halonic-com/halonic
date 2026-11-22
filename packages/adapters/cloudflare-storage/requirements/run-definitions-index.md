# cloudflare-storage.run-definitions-index

- Status: active
- Since: unreleased
- Source: HAL-16011 (part a1 of HAL-13210, option 2 of its open design point: the Worker reads a compiled index, it gets no YAML parser)

When `halonic deploy` writes a workspace snapshot, it shall write the run-definitions index, `run-definitions.index.json`, in the same snapshot: for every hub the workspace has a file in, the definitions `definitionsOf` of `@halonicjs/workspace` builds from the same loaded workspace the files come from, so a run the Worker starts has the workflows and agents `halonic serve` would start it with. The index is listed in the manifest with its hash like a file, so it is checked as any file is, it is left out of `list`, and a Worker version pinned to a snapshot (`deploy.definitions-pinned`) reads that snapshot's index, after a rollback too. The writer shall refuse a workspace file at the index's own path with a `RangeError`.

The index shall carry a `format` number. `readRunDefinitionsIndex` shall read the index without a YAML parser and fail with a `DefinitionSnapshotError` when the snapshot has no index or an index in a format older than its own (with a message that says to run `halonic deploy` again), an index in a newer format (with a message that says to update Halonic), or an index that isn't JSON or doesn't fit its shape.

## Examples

- Given an `acme` workspace with one hub, a workflow and an agent,
  when it is written as a snapshot and its index is read back,
  then each hub's definitions equal those `definitionsOf` builds from the loaded workspace.
- Given deploy A and then deploy B, each with a different workflow,
  when the deploy rolls back to A,
  then the live Worker version reads A's workflow from the index.
- Given an index whose `format` is newer than the reader's,
  when `readRunDefinitionsIndex` reads it,
  then it fails with a `DefinitionSnapshotError` that says to update Halonic.
- Given a snapshot written without the index,
  when `readRunDefinitionsIndex` reads it,
  then it fails with a `DefinitionSnapshotError` that says to run `halonic deploy` again.
