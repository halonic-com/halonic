# plugin-build.previous-build

- Status: active
- Since: unreleased
- Source: HAL-17950 plan rev 1 (the plugin builder), with Liam's conditions on HAL-17985; HAL-17986; HAL-18365

When the plugin builder reads a previous build, it shall read the release file strictly, check the archive's size and its sha-256 against the release file before reading any of it, read only `package/snapshot.json` up to 4 MiB, and check that snapshot as untrusted data, and if any step fails, then it shall refuse the previous build and say which step.

## Examples

- Given a previous build it wrote itself, when it is read, then its release file and snapshot come back.
- Given an archive whose sha-256 isn't the release file's, when it is read, then it is refused before any header is read.
- Given an archive without `package/snapshot.json`, or with a snapshot over 4 MiB, when it is read, then it is refused.
- Given a snapshot that isn't JSON, names a tool twice or is nested deeper than schema-kit allows, when it is read, then it is refused.
- Given a snapshot that names a signal twice, has a signal without an id or more than 50 signals, when it is read, then it is refused.
- Given a snapshot with a signal id that doesn't fit the format's id pattern, such as `Watcher` or `../x`, when it is read, then it is refused, so it never reaches the release file's change list.
