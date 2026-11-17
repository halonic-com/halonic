# studio.workspace-agents

- Status: active
- Since: 0.1.0
- Source: HAL-1299 (T6 PR 2b, PR 4a); flow-agents 2.1; states K2 (files are changed through the workspace's files, never the engine)

When the desktop app opens a folder, it shall give the Agents feature the folder's hub agents, read from the workspace's files with their unsaved changes. It shall create a new agent as one undoable change of the workspace's files, with an id taken from its name (`-2` when the hub has it), without the engine, and refuse a hub the workspace doesn't have. It shall change an agent's name, description or instructions by editing its file in place, so comments and key order stay, as one undoable change that typing in one field coalesces, and refuse an empty name or an agent it doesn't have without writing. It shall name the workflows of an agent's hub that run it in a step, and tell its listeners when a file changed.

## Examples

- Given Acme's hub with an agent `writer` that names a model, then the list holds `writer` with that model.
- Given the name "Refund checker", then the new file is `hubs/acme/agents/refund-checker.agent.yaml`, it is unsaved and listed at once.
- Given acme already has `refund-checker`, then the id is `refund-checker-2`.
- Given a name with a quote or a colon, then the file's name is the name as typed.
- Given a hub the workspace doesn't have, then creating an agent fails with `not_found` and writes nothing.
- Given a workflow of the hub with a step that runs `writer`, then `referencesTo` holds that workflow; for an agent the hub doesn't have it rejects with `not_found`.
- Given a file changes, then a subscriber hears it, and not after it stopped.
- Given an agent file with comments, when its name and instructions change, then the file keeps its comments, `settings` gives the new values and the other fields stay.
- Given an empty name, or an agent the hub doesn't have, then `update` fails with `invalid_input` or `not_found` and writes nothing.
