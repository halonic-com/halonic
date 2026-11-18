# studio.workspace-agents-trash

- Status: draft
- Since: unreleased
- Source: HAL-12214 (A4, from the UX check HAL-12213); HAL-1299 point 3

The app's agents host shall give the path of an agent's file, and move an agent's file to the trash as one undoable change, with the way back, which puts the agent back only while the delete is still the newest change and otherwise rejects with `conflict` and changes nothing; for an agent that isn't there both shall reject with `not_found`.

## Examples

- Given the agent `writer` in the hub `acme`, then its file path is `hubs/acme/agents/writer.agent.yaml`.
- Given `trash` on `writer`, then its file is gone and the list is empty, as one change labelled "Deleted agent Writer".
- Given Undo right after, then the file is back as it was.
- Given another change was made after the delete, then Undo rejects with `conflict`.
- Given an agent that isn't in the workspace, then `filePath` and `trash` reject with `not_found`.
