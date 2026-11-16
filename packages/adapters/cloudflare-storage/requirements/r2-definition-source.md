# cloudflare-storage.r2-definition-source

- Status: active
- Since: 0.1.0
- Source: HAL-11277 (routine index, format 2); HAL-6794; `DefinitionSource` port v2; build plan (HAL-197) part 4; snapshot format proposed to Mateo on the child task of HAL-6794

The R2 definition source shall read the workspace snapshot that `halonic deploy` uploads and offer only the read side of the port: it has no `write` or `remove`. A snapshot is `<prefix><version>/manifest.json`, the files at `<prefix><version>/files/<path>`, and `<prefix>current`, which names the served version and is written last. `list` and `read` shall answer from the manifest, never by listing R2, so a path that isn't in the manifest never becomes a key. A source shall serve one version for its whole life, whether given or looked up once from `current`. Each file shall be checked against the hash in the manifest as it is read, and a mismatch, a missing file, a missing snapshot, a newer `formatVersion` or a manifest that is malformed (an unsafe, duplicate or unsorted path, a bad hash or size, a bad version) shall fail with a `DefinitionSnapshotError`. Private files shall be left out by the writer and by `list`. The writer shall also upload the routine index, `routines.index.json`, listed in the manifest like a file but left out of `list`: the placed routines of the same loaded workspace, with nothing the routine files don't hold (a secret stays its name), so the Worker finds the routines a webhook can start without reading YAML. `readRoutineIndex` shall check the index against the routine schema and fail with a `DefinitionSnapshotError` when it is missing or malformed. The writer shall refuse a workspace file at the index's own path with a `RangeError`. A snapshot in an older format shall be refused with a message that says to run `halonic deploy` again, and a newer one with a message that says to update Halonic. The writer shall refuse a path the port forbids with a `RangeError`, and two different workspaces shall never get the same version.

## Examples

- Given a workspace uploaded and a second one uploaded after the source started,
  when the source reads a file,
  then it still reads the first version.
- Given an object whose bytes differ from the manifest's hash,
  when its file is read,
  then the read fails with a `DefinitionSnapshotError`.
- Given a path the manifest doesn't list,
  when it is read,
  then the answer is `null` and R2 isn't called.
- Given a workspace with a `.env` file,
  when it is uploaded,
  then no object of the snapshot holds `.env`.
- Given a workspace with an `.env` file and a routine whose webhook names a secret,
  when it is uploaded with its routines,
  then the secret's value is in no object, and the index holds the secret's name.
- Given a snapshot in format 1,
  when it is read,
  then it fails with a `DefinitionSnapshotError` that says to run `halonic deploy` again.
