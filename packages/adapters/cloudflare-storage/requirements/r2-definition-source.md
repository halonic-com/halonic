# cloudflare-storage.r2-definition-source

- Status: active
- Since: 0.1.0
- Source: HAL-6794; `DefinitionSource` port v2; build plan (HAL-197) part 4; snapshot format agreed with Mateo on the child task of HAL-6794

The R2 definition source shall read the workspace snapshot that `halonic deploy` uploads and offer only the read side of the port: it has no `write` or `remove`. A snapshot is `<prefix><version>/manifest.json`, the files at `<prefix><version>/files/<path>`, and `<prefix>current`, which names the served version and is written last. `list` and `read` shall answer from the manifest, never by listing R2, so a path that isn't in the manifest never becomes a key. A source shall serve one version for its whole life, whether given or looked up once from `current`. Each file shall be checked against the hash in the manifest as it is read, and a mismatch, a missing file, a missing snapshot or a newer `formatVersion` shall fail with a `DefinitionSnapshotError`. Private files shall be left out by the writer and by `list`.

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
