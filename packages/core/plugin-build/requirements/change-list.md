# plugin-build.change-list

- Status: active
- Since: unreleased
- Source: HAL-17950 plan rev 1 (the plugin builder), with Liam's conditions on HAL-17985; HAL-17986

The plugin builder shall list the tools a new snapshot adds and removes compared with the previous build's snapshot, and for each tool in both, the fields whose values differ as canonical JSON, each list sorted, and without a previous build it shall list every tool as added.

## Examples

- Given no previous build and the tools `b` and `a`, then `added` is `a`, `b`.
- Given a previous build with `a` and `old` and a new snapshot with `a` (another description) and `new`, then `new` is added, `old` removed, and `a` changed in `description`.
- Given a field whose keys only come in another order, then it is not changed.
