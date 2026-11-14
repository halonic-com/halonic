# studio.src-tauri.plugin-records-scope

- Status: draft
- Since: 0.1.0
- Source: HAL-9377; `pluginRecordsFolder` in `@halonicjs/profile`; `studio.src-tauri.workspace-data-commands`

When a `record_*` command is called with the scope `plugins` instead of a workspace, the shell shall keep the records in the folder `pluginRecordsFolder` names, in `@halonicjs/profile`, for the CLI's profile, in the same files and under the same write lock as for a workspace, so the plugins' install records and settings values are the ones the CLI reads. A call shall name a workspace or a scope, and not both: the shell shall refuse a call that names both or neither before it reads or writes anything. The only scope shall be `plugins`, and no scope shall name a path.

## Examples

- Given the scope `plugins`,
  when the page calls `record_read` for the collection `plugin-settings`,
  then the shell reads the log in `<profile>/plugin-records`.
- Given a call that names a workspace and the scope `plugins`,
  when the shell gets it,
  then it is refused and nothing is read or written.
- Given the scope `trust`,
  when the shell gets the call,
  then it is not a scope and the call fails.
