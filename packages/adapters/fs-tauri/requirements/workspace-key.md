# fs-tauri.workspace-key

- Status: draft
- Since: 0.1.0
- Source: HAL-9378; `studio.src-tauri.workspace-key-command`; `forConnector` in `@halonicjs/google-setup`

When `readWorkspaceKey` is called with a workspace folder, it shall ask the shell's `workspace_key` command for the key of the workspace folder it is given, and answer the key, 32 lower-case hex characters, without working out or changing anything itself. It shall send the folder as the person opened it and nothing else. It shall turn the shell's refusals into the same error kinds as the Tauri record store, in its own wording for a key lookup, so a folder that isn't open is `denied`, and an answer that isn't a 32-character hex key, or any other failure, into `unavailable`.

## Examples

- Given an opened workspace,
  when `readWorkspaceKey` is called with its folder,
  then the shell received `workspace_key` with `{ workspace }` and the call answers the shell's key.
- Given a shell that refuses with `folder_not_open`,
  when `readWorkspaceKey` is called,
  then it rejects as `denied`.
- Given a shell that answers a path instead of a key,
  when `readWorkspaceKey` is called,
  then it rejects as `unavailable`.
