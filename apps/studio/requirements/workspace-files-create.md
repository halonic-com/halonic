# studio.workspace-files-create

- Status: active
- Since: unreleased
- Source: HAL-329 files flow 5; HAL-1293

The app's files host shall create a new file as an empty file added to the workspace's unsaved changes as one undo step, and refuse a path that already has a file, is a folder, has a file on the way, or that the workspace doesn't serve.

## Examples

- Given the path `hubs/p/agents/b.agent.yaml` has no file,
  when the user creates it,
  then an empty file is added as one undo step labelled "New file hubs/p/agents/b.agent.yaml".
- Given `workspace.yaml` has a file,
  when the user creates it,
  then the host rejects with "workspace.yaml already exists." and changes nothing.
- Given `hubs/p/agents` is a folder holding files,
  when the user creates it,
  then the host rejects with "hubs/p/agents is a folder." and changes nothing.
- Given `workspace.yaml` has a file,
  when the user creates `workspace.yaml/x.yaml`,
  then the host rejects with "workspace.yaml is a file, not a folder." and changes nothing.
- Given the path `hubs//x.yaml` or `.git/config`,
  when the user creates it,
  then the host rejects with "Files must stay inside the workspace." or `".git/config" is not part of the workspace definitions` and changes nothing.
