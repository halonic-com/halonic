# workspace-engine-node.engine-state-folders

- Status: active
- Since: unreleased
- Source: D11 of the HAL-14206 design (one resolver for a workspace's engine state); HAL-14217

The engine of a workspace (`cli.local-engine`), the CLI's run store (`openWorkspaceRuns`) and the agent host's engine role shall find the folders of a workspace's engine state on this computer through one resolver, `engineStateFolders`. It shall name those folders after the workspace's real path, with the folders `profile.workspace-folders` gives in the profile folder, and never after a file inside the workspace, so two spellings of one folder, such as a link to it, get the same folders. It shall create nothing. For a given real path and profile folder it shall give the folders in `golden/workspace-folders.json` of `@halonicjs/profile`, which the Studio's Rust side checks too, so the engine lock and runs the CLI uses are the ones the Studio finds. When another engine holds the workspace's engine lock, opening an engine shall fail with `EngineLockHeldError`, an error that no other lock can raise.

## Examples

- Given the real path `/srv/acme/workspace` and the profile folder `/srv/acme/.local/share/halonic` on Linux,
  when its engine state folders are found,
  then the folder is `/srv/acme/.local/share/halonic/workspaces/3a799e428169278421370a605619c6ed`.
- Given a link to a workspace folder,
  when the engine state folders are found for the link and for the folder,
  then they are the same folders.
- Given an open engine on the Acme example,
  when a second engine is opened on it,
  then it fails with `EngineLockHeldError`, naming the first engine's process.
