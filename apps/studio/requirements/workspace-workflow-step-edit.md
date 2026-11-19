# studio.workspace-workflow-step-edit

- Status: active
- Since: unreleased
- Source: HAL-12216 (T7b PR 1b); UX checklist 10.8; flow-workflows 5.2; save model (HAL-1300); states K2 (files are changed through the workspace's files, never the engine)

When the Workflows feature reads a workflow, the desktop app shall give each step its whole description, its prompt when the file gives it as text (and say when the file gives it as data instead), and the name its output is saved as. When the feature changes a step's description, prompt or output name, the desktop app shall edit the step in the workflow's file in place as one undoable change of the workspace's files, keeping comments and the other keys, and take a field that is emptied out of the file. It shall refuse, and write nothing, a workflow or step that isn't there and a prompt the file gives as data.

## Examples

- Given the step `draft` with the description "Draft an answer" and the prompt "Answer {{input.message}}", then reading it gives both, and no output name.
- Given the step `sort` whose `input` is a mapping, then its prompt is absent and it says the prompt is data.
- Given `draft`, when its prompt is changed to "Answer kindly" and its output to "answer", then the file has both in one change, and the comment above `agent` stays.
- Given `draft`, when its description is emptied, then `description` is gone from the file; emptying an output it doesn't have writes nothing.
- Given a step or a workflow that isn't there, or a prompt given as data, then the change fails and nothing is written.
