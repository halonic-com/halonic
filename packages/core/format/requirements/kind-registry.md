# format.kind-registry

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2); the plugin manifest from HAL-1734; the workspace tool from HAL-17948; the workspace template from HAL-18141; the workspace signal from HAL-17980; the workspace routing from HAL-18263

The format shall register each of the 14 file kinds the old schema and loader read once, under its old name, and the workspace tool (`tool`, `library/tools/<id>.tool.yaml` at the workspace root) after `skill`, the workspace template (`template`, `library/templates/<id>.md` at the workspace root) after `tool`, the workspace signal (`signal`, `library/signals/<id>.signal.yaml` at the workspace root) after `template`, and the workspace routing (`routing`, `routing.yaml` at the workspace root) after `signal`, each with its syntax, schema, places in the one layout and id rule, and after them the two kinds that sit outside workspaces, the integration sheet and the plugin manifest, so that the loader and the tooling list kinds without a switch over their names.

## Examples

- Given the registry, when its names are listed, then they are the 14 kinds, `tool`, `template`, `signal` and `routing`, workspace-level first, then `integration` and `plugin`, which have no place.
- Given `toString`, when `isKindName` checks it, then it is not a kind.
