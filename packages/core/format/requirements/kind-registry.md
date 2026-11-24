# format.kind-registry

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2); the plugin manifest from HAL-1734; the tool definition from HAL-17962

The format shall register each of the 14 file kinds the old schema and loader read once, under its old name, with its syntax, schema, places in the one layout and id rule, and after them the three kinds with no place in the loader's layout, the integration sheet, the plugin manifest and the tool definition, so that the loader and the tooling list kinds without a switch over their names.

## Examples

- Given the registry, when its names are listed, then they are the 14 kinds, workspace-level first, then `integration`, `plugin` and `tool`, which have no place.
- Given `toString`, when `isKindName` checks it, then it is not a kind.
