# workspace.snapshot-input

- Status: active
- Since: unreleased
- Source: HAL-18141 (plan on HAL-17956, PR 2)

When the plugin builder asks `snapshotInputOf` for a workspace commit's snapshot input, the workspace package shall give the name in `workspace.yaml`, the commit it is given, every parsed tool file and every parsed template file (`library/templates/<id>.md`), so that the builder passes it to `makeSnapshot` without listing the workspace's files itself.

## Examples

- Given a workspace with a `paperclip.template` tool and the templates `task-spec.md` (with a title) and `card.md`, when its snapshot is made, then it has the tool and the templates `card` and `task-spec`, sorted by id, with their text trimmed.
