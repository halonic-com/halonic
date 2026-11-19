# studio.workspace-workflow-rename

- Status: active
- Since: unreleased
- Source: HAL-12216 (T7b PR 1); UX checklist 10.2 Rename; flow-workflows 2.3; save model 5; states K2 (files are changed through the workspace's files, never the engine)

When the Workflows feature renames a workflow, the desktop app shall set the `name` in the workflow's file to the trimmed name as one undoable change of the workspace's files, keeping the file's comments, the order of its keys, its id and its path, and give the new name for the workflow's tab at once. It shall refuse, and write nothing, an empty name, a name another workflow of the same hub has in any case ("A workflow called Mail triage already exists."), and a workflow the hub doesn't have.

## Examples

- Given `reply` named "Reply" with a comment at the top of its file, when it is renamed "  Mail triage ", then the file has `name: Mail triage`, its comment, `id: reply` and the same path, in one change, and reading it gives "Mail triage".
- Given acme also has `triage` named "Mail triage", when `reply` is renamed "mail TRIAGE", then the rename fails with "A workflow called Mail triage already exists." and nothing is written.
- Given only the hub beta has a workflow named "Mail triage", when acme's `reply` is renamed "Mail triage", then it is renamed.
- Given an empty name, or a workflow acme doesn't have, then the rename fails and nothing is written.
