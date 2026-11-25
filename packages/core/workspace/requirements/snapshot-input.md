# workspace.snapshot-input

- Status: active
- Since: unreleased
- Source: HAL-18141 (plan on HAL-17956, PR 2); the signal files from HAL-17980; the routing file from HAL-18263

When the plugin builder asks `snapshotInputOf` for a workspace commit's snapshot input, the workspace package shall give the name in `workspace.yaml`, the commit it is given, every parsed tool file, every parsed template file (`library/templates/<id>.md`), every parsed signal file (`library/signals/<id>.signal.yaml`) and the routing of a parsed `routing.yaml`, if there is one, so that the builder passes it to `makeSnapshot` without listing the workspace's files itself.

## Examples

- Given a workspace with a `paperclip.template` tool and the templates `task-spec.md` (with a title) and `card.md`, when its snapshot is made, then it has the tool and the templates `card` and `task-spec`, sorted by id, with their text trimmed; given also `watcher.signal.yaml` with `wakeOn: [ci-red]`, the snapshot has that signal with its other settings filled in.
