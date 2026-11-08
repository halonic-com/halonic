# format.kind-registry

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2)

The format shall register each of the 14 file kinds the old schema and loader read once, under its old name, with its syntax, schema, places in the one layout and id rule, so that the loader and the tooling list kinds without a switch over their names.

## Examples

- Given the registry, when its names are listed, then they are the 14 kinds, workspace-level first.
- Given `toString`, when `isKindName` checks it, then it is not a kind.
