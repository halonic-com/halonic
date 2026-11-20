# studio.workspace-workflow-read

- Status: active
- Since: unreleased
- Source: HAL-9865 (T7 PR 3); flow-workflows 4.1; states K2 (files are read from the workspace, never the engine); HAL-12368 (UX check rule N5)

When the Workflows feature asks for one workflow, the desktop app shall give its name, first step, steps in the file's order with their kind and agent, the arrows between them with their labels, and the places a person gave the steps, read from the workspace's files with their unsaved changes and without the engine, and fail saying which workflow when the hub doesn't have it. When the window has an engine, it shall also say, from the same files, why the engine would refuse to start the workflow's run (an agent that lists a connector, or an agent in a harness program where no agent host runs), with the next step, and the command that starts it in a terminal when the step is one, as `studio.engine-service` words them, so **Run** can be unavailable before it is pressed.

## Examples

- Given the workflow `reply` with the step `first` (an agent step with the agent `writer`) leading to `done` with the label "ok", then reading it gives its name, its first step, both steps in the file's order with the agent, the arrow `first → done` labelled "ok", and the places a person gave the steps.
- Given a workflow that isn't in the hub, then reading it fails and says which one.
- Given no agent host, and the unsaved files give `reply`'s agent Writer the harness `codex`, when the Workflows feature asks why `reply` can't start, then it gets "Writer runs in Codex, which Halonic can't start yet." and "Set Writer to Halonic on its Harness page to run it now.", with no command.
- Given the agent host runs and Writer has the harness `codex`, when the Workflows feature asks why `reply` can't start, then nothing stops it.
