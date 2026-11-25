# plugin-build.release-file

- Status: active
- Since: unreleased
- Source: HAL-17950 plan rev 1 (the plugin builder), with Liam's conditions on HAL-17985; HAL-17986; the routing changes from HAL-18263; the signal changes from HAL-18365; the snapshot's SHA-256 from HAL-18195

The plugin builder shall write a release file as canonical JSON with a line break at the end, holding exactly `pluginId`, `version`, `archive`, `sha256`, `snapshotSha256` (the SHA-256 of the archive's `package/snapshot.json` bytes), `workspaceCommit`, `halonicVersion` and `changes` (`added`, `removed` and `changed` with `tool` and `fields`, `routing` when the routing changed, and `signals` with `added`, `removed` and `changed` when a signal changed), where `archive` is always `<pluginId>-<version>.tar`. If a release file it reads is larger than 256 KiB, isn't JSON, has a field it doesn't know, or has an id, version, archive name, sha-256, snapshot sha-256, commit, Halonic version or routing entry (`roles.<slug>` or `areas.<slug>`) that isn't in its strict form, or a `signals` list longer than 50 or holding anything but a signal id, then it shall refuse the file; a file without `snapshotSha256`, from an earlier build, it shall read.

## Examples

- Given the fields of a build, when the release file is written and read back, then it reads as the same fields with `archive` added.
- Given a built archive, when its release file is written, then its `snapshotSha256` is the SHA-256 of the archive's `package/snapshot.json`.
- Given a release file without `snapshotSha256`, when it is read, then it is read.
- Given a release file whose `archive` is `../other.tar`, when it is read, then it is refused.
- Given a release file with an extra field `install`, when it is read, then it is refused.
- Given a release file whose `changes.routing` holds `login` or `roles.Liam`, when it is read, then it is refused.
- Given a release file whose `changes.signals.added` holds `Watcher` or `../x`, or whose `changes.signals` has no `changed`, when it is read, then it is refused.
