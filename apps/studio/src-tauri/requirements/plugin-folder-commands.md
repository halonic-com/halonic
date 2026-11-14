# studio.src-tauri.plugin-folder-commands

- Status: draft
- Since: 0.1.0
- Source: HAL-9377; `pluginsFolder` in `@halonicjs/profile`; `studio.src-tauri.crates.workspace-files.folder-reader`

When the page calls a `plugin_folder_*` command, the shell shall work in the folder `pluginsFolder` names, in `@halonicjs/profile`, for the CLI's profile, and never in a folder the page names. The commands shall only read: they list entries with their kind, give a file's exact bytes and give real locations, never follow a link, never open a special file and refuse a path that is unsafe. If the plugins folder is a link, or not a folder, then the shell shall refuse every call. If there is no plugins folder yet, then the shell shall answer as for an empty one and create nothing. `plugin_folder_reveal` shall show only the plugins folder or the folder of one installed plugin in the file manager, never a link, a file or a path outside it.

## Examples

- Given a plugins folder holding `acme-weather/plugin.yaml`,
  when the page calls `plugin_folder_read` for `acme-weather/plugin.yaml`,
  then it gets the file's bytes as base64url.
- Given no plugins folder,
  when the page calls `plugin_folder_entries`,
  then it gets no entries, and no folder is made.
- Given a plugins folder that is a symbolic link,
  when the page calls `plugin_folder_entries`,
  then it is refused as `private_path`.
- Given `acme-weather` is a link to a folder outside the plugins folder,
  when the page calls `plugin_folder_reveal` for `acme-weather`,
  then nothing is shown and the answer is `false`.
