# fs-tauri.review-records-on-disk

- Status: draft
- Since: 0.1.0
- Source: HAL-1291 (T3 part 4a); where the records go: HAL-3277 and HAL-3417 (kept in the profile like trust, never in the workspace); `reviewFolder` in `@halonicjs/profile`; `openWorkspace`'s `reviewRecords`; `DefinitionStore` port v2

The desktop app shall keep a workspace's review records (the assistant's changes to review, one record per file) where the CLI keeps them: in `<profile>/workspaces/<key>/review`, the folder `reviewFolder` in `@halonicjs/profile` names.

A Tauri definition store made with `folder: "review"` shall call the shell's `fs_list`, `fs_read`, `fs_write` and `fs_remove` commands with the workspace it was made for and `folder: "review"`, never with a path to the profile, and shall give the same answers and errors as the workspace's own store. The shell shall work out the review folder itself from the opened folder's real path and refuse a workspace that isn't open with `folder_not_open`. It shall make the folder on the first write only, so reading the records of a workspace that has none changes nothing in the profile. Its watch shall report nothing and call nothing, since only Halonic edits the records. A store made without `folder` shall send no `folder`, as before.

## Examples

- Given a store for `/workspaces/acme` with `folder: "review"`,
  when it writes `agents/clerk.agent.yaml`,
  then the shell receives `fs_write` with the workspace, `folder: "review"` and the path, and the workspace's own `agents/clerk.agent.yaml` is unchanged.
- Given a workspace with no review records yet,
  when the review store lists them,
  then it answers `[]` and no review folder is made in the profile.
- Given the review store,
  when a watch is opened and closed,
  then the shell receives no call and the listener hears nothing.
