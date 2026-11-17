# studio.workspace-workflows

- Status: active
- Since: unreleased
- Source: HAL-9758 (T7 PR 3); flow-workflows 2.2; states K2 (files are changed through the workspace's files, never the engine)

When the desktop app opens a folder, it shall give the Workflows feature the folder's hub workflows, each with the errors and warnings the workspace's checks found in its file and the number of its real runs that wait or run, read from the workspace's files with their unsaved changes. It shall create a new workflow as one undoable change of the workspace's files, with an id taken from its name (`-2` when the hub has it), the step `start` leading to the final step `done`, without the engine, and refuse a hub the workspace doesn't have. It shall tell its listeners when a file changed or a run started, moved on or ended.

## Examples

- Given Acme's hub with a workflow `reply` that has a warning and one waiting run, then the list holds `reply` with 1 warning, 0 errors and 1 waiting run.
- Given a test run of `reply`, then it isn't counted.
- Given the name "Invoice intake", then the new file is `hubs/acme/workflows/invoice-intake.workflow.yaml`, it is unsaved, listed at once and has no errors (one warning: the step `start` has no agent and passes straight through).
- Given acme already has `invoice-intake`, then the id is `invoice-intake-2`.
- Given a name with a quote or a colon, then the file's name is the name as typed.
- Given a hub the workspace doesn't have (or an empty one), then creating a workflow fails and writes nothing.
- Given a file changes, or a run starts, then a subscriber hears it, and not after it stopped.
