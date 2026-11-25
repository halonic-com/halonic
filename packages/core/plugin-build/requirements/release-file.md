# plugin-build.release-file

- Status: active
- Since: unreleased
- Source: HAL-17950 plan rev 1 (the plugin builder), with Liam's conditions on HAL-17985; HAL-17986; the routing changes from HAL-18263

The plugin builder shall write a release file as canonical JSON with a line break at the end, holding exactly `pluginId`, `version`, `archive`, `sha256`, `workspaceCommit`, `halonicVersion` and `changes` (`added`, `removed` and `changed` with `tool` and `fields`, and `routing` when the routing changed), where `archive` is always `<pluginId>-<version>.tar`. If a release file it reads is larger than 256 KiB, isn't JSON, has a field it doesn't know, or has an id, version, archive name, sha-256, commit, Halonic version or routing entry (`roles.<slug>` or `areas.<slug>`) that isn't in its strict form, then it shall refuse the file.

## Examples

- Given the fields of a build, when the release file is written and read back, then it reads as the same fields with `archive` added.
- Given a release file whose `archive` is `../other.tar`, when it is read, then it is refused.
- Given a release file with an extra field `install`, when it is read, then it is refused.
- Given a release file whose `changes.routing` holds `login` or `roles.Liam`, when it is read, then it is refused.
