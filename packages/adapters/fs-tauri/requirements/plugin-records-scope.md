# fs-tauri.plugin-records-scope

- Status: draft
- Since: 0.1.0
- Source: HAL-9377; `studio.src-tauri.plugin-records-scope`; `pluginRecordsFolder` in `@halonicjs/profile`

The Tauri record store shall, when it is made for the `plugins` scope, name that scope and no workspace in every `record_*` call, so it keeps the plugins' settings and install records in the folder the CLI uses. When it is made for a workspace, its calls shall name the workspace and no scope, as before.

## Examples

- Given a store made for the `plugins` scope,
  when it appends a change,
  then the call holds `scope: "plugins"` and no `workspace`.
- Given a store made for `/workspaces/acme`,
  when it reads a collection,
  then the call holds the workspace and no `scope`.
