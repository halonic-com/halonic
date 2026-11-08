# ports.every-port-versioned

- Status: active
- Since: 0.1.0
- Source: new in the core ports package: every port carries a version, so an adapter can say which one it implements

The ports package shall give every port file one version constant, a positive whole number, list every port with that version in `portVersions`, and list the same ports and versions in the README table.

## Examples

- Given the port file `run-store.ts`,
  when its exports are read,
  then it has exactly one version constant, `runStoreVersion`, and `portVersions.RunStore` equals it.
- Given a new port file `vector-index.ts` with `vectorIndexVersion = 1` that isn't in `portVersions`,
  when the tests run,
  then they fail and name the file.
- Given `portVersions.RunStore` is 2 and the README table says 1,
  when the tests run,
  then they fail.
