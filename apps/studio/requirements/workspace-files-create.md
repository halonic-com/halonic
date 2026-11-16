# studio.workspace-files-create

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 5; HAL-1293

The app's files host shall create a new file as an empty file added to the workspace's unsaved changes as one undo step, and refuse a path that already has a file.

## Examples

- Given the path `hubs/p/agents/b.agent.yaml` has no file,
  when the user creates it,
  then an empty file is added as one undo step labelled "New file hubs/p/agents/b.agent.yaml".
- Given `workspace.yaml` has a file,
  when the user creates it,
  then the host rejects with "workspace.yaml already exists." and changes nothing.
