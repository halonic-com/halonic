# studio.workspace-workflow-step-edit

- Status: active
- Since: unreleased
- Source: HAL-12216 (T7b PR 1b, 1c); UX checklist 10.8; flow-workflows 5.2; save model (HAL-1300); states K2 (files are changed through the workspace's files, never the engine); C285 TY1 (HAL-14002)

When the Workflows feature reads a workflow, the desktop app shall give each step its whole description, its prompt when the file gives it as text (and say when the file gives it as data instead), and the name its output is saved as, and give the workflow the agents of its own hub (id and name) for the Agent picker. When the feature changes a step's kind, agent, description, prompt or output name, the desktop app shall edit the step in the workflow's file in place as one undoable change of the workspace's files, keeping comments and the other keys, and take a field that is emptied out of the file. A new kind shall change only `type`, so the keys of the old kind stay in the file: a kind other than an agent step shall go in as the step's first key, and an agent step, the default, shall take `type` out. It shall refuse, and write nothing, a workflow or step that isn't there, a kind the format doesn't have and a prompt the file gives as data.

## Examples

- Given the step `draft` with the description "Draft an answer" and the prompt "Answer {{input.message}}", then reading it gives both, and no output name.
- Given the step `sort` whose `input` is a mapping, then its prompt is absent and it says the prompt is data.
- Given `draft`, when its prompt is changed to "Answer kindly" and its output to "answer", then the file has both in one change, and the comment above `agent` stays.
- Given `draft`, when its description is emptied, then `description` is gone from the file; emptying an output it doesn't have writes nothing.
- Given the agents `writer` in acme and `sorter` in beta, then reading acme's `reply` gives only "Reply writer" (`writer`).
- Given `draft` with the agent `writer`, when its kind is changed to Wait, then `type: wait` is written as its first key, above the comment, and `agent: writer` stays; changed back to Agent step, the file is as it was; when it is changed back with no agent, `agent` is gone; picking `sorter` writes it.
- Given a step or a workflow that isn't there, a kind such as `loop`, or a prompt given as data, then the change fails and nothing is written.
