# studio.src-tauri.workspace-key-command

- Status: draft
- Since: 0.1.0
- Source: HAL-9378; `workspaceFolders` in `@halonicjs/profile`; `forConnector` in `@halonicjs/google-setup`; `studio.src-tauri.workspace-data-commands`

When the page calls `workspace_key` with a folder, the shell shall answer the workspace's key, the 32 lower-case hex characters that name the workspace's folder in the profile, as `{ key }`, and nothing else: no folder and no path. The key shall be the one `WorkspaceFolders::key` in the profile crate gives, so it is the name of the folder the `record_*` commands use for the same workspace, and a roundabout spelling of the opened folder shall give the same key. A folder inside the opened workspace shall be treated as a folder of its own, like the `record_*` commands do: it is accepted and gets its own key, not the workspace's. The shell shall refuse a folder the person didn't open with `folder_not_open`, like the `record_*` commands. The command shall only read: it creates nothing. The command shall be granted to the app's own local main window only, never to the Studio the computer serves.

## Examples

- Given the opened folder `acme`,
  when the page calls `workspace_key` with it,
  then it answers the key that is the name of `acme`'s folder in the profile, and no path.
- Given `<acme>/sub/..`,
  when the page calls `workspace_key` with it,
  then it answers the same key as for `acme`.
- Given `<acme>/sub`,
  when the page calls `workspace_key` with it,
  then it answers a key different from the one for `acme`.
- Given a folder that isn't open,
  when the page calls `workspace_key` with it,
  then the shell refuses with `folder_not_open`.
- Given a request from the computer's served Studio,
  when it calls `workspace_key`,
  then the shell refuses it like every other command.
