# studio.workspace-agents-trash

- Status: draft
- Since: unreleased
- Source: HAL-12214 (A4, from the UX check HAL-12213); HAL-1299 point 3; HAL-15120 (C544 finding 9)

The app's agents host shall give the path of an agent's file, and move an agent's file to the trash as one undoable change, with the way back of `studio.undoable-delete`, which puts the agent back after later changes too and rejects with `conflict`, changing nothing, only when a file has taken its place; for an agent that isn't there both shall reject with `not_found`.

## Examples

- Given the agent `writer` in the hub `acme`, then its file path is `hubs/acme/agents/writer.agent.yaml`.
- Given `trash` on `writer`, then its file is gone and the list is empty, as one change labelled "Deleted agent Writer".
- Given Undo right after, then the file is back as it was.
- Given another change was made after the delete, then Undo puts the file back as it was, as a change labelled "Put back agent Writer".
- Given a new `hubs/acme/agents/writer.agent.yaml` was made after the delete, then Undo rejects with `conflict` and the new file stays.
- Given an agent that isn't in the workspace, then `filePath` and `trash` reject with `not_found`.
