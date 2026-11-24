# plugin-build.archive

- Status: active
- Since: unreleased
- Source: HAL-17950 plan rev 1 (the plugin builder), with Liam's conditions on HAL-17985; HAL-17986

The plugin builder shall write a plugin package as one uncompressed ustar archive that holds exactly four files, `package/manifest.js`, `package/package.json`, `package/snapshot.json` and `package/worker.js`, sorted by name, each with mtime 0, mode 0644, uid and gid 0 and empty owner names, with the snapshot as canonical JSON (keys sorted) and a line break at the end, so the same parts always give the same bytes and the same sha-256. If the parts it is given hold anything besides these four, then the plugin builder shall refuse to write the archive.

## Examples

- Given the same four parts twice, when each is written, then the two archives have the same bytes.
- Given the same snapshot with its keys in another order, when each is written, then the two archives have the same bytes.
- Given the fixed test parts, when the archive is written, then its sha-256 is the golden value in the test.
- Given the four parts and a fifth part `extra`, when the archive is written, then it is refused and nothing is written.
