# workspace.harness-working-folders

- Status: active
- Since: 0.1.0
- Source: Julian's security check on HAL-4739, tracked by Priya on HAL-4759; stack 4h of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan)

The workspace package shall list the working folder of every harness agent in a workspace (one whose `harness` is set and isn't `halonic`), in every hub, with `files/agents/<id>` for an agent whose file names no folder. Each folder is relative to the workspace root, as the agent file wrote it, listed once and sorted by code unit. Agents in Halonic's own loop add nothing.

The reason: whoever starts a local connector's program passes these folders, as real absolute paths, in `ConnectorFactoryContext.workingFolders`, so the start is refused when it would run or load a file an agent could have written (`format.working-folder-start`). Every harness agent counts, not only the agents of the run that starts the program, because an agent of any workflow may have written there before.

## Examples

- Given a Claude Code agent with `workingFolder: scripts` and a Codex agent `writer` in the hub `support` with no folder, then the list is `files/agents/writer`, `scripts`.
- Given only agents without a harness or with `halonic`, then the list is empty.
- Given two harness agents with the folder `out`, then the list is `out`.
