# studio.workspace-workflow-read

- Status: active
- Since: 0.1.0
- Source: HAL-9865 (T7 PR 3); flow-workflows 4.1; states K2 (files are read from the workspace, never the engine)

When the Workflows feature asks for one workflow, the desktop app shall give its name, first step, steps in the file's order with their kind and agent, the arrows between them with their labels, and the places a person gave the steps, read from the workspace's files with their unsaved changes and without the engine, and fail saying which workflow when the hub doesn't have it.

## Examples

- Given the workflow `reply` with the step `first` (an agent step with the agent `writer`) leading to `done` with the label "ok", then reading it gives its name, its first step, both steps in the file's order with the agent, the arrow `first → done` labelled "ok", and the places a person gave the steps.
- Given a workflow that isn't in the hub, then reading it fails and says which one.
