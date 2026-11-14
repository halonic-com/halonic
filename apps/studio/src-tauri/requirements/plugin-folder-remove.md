# studio.src-tauri.plugin-folder-remove

- Status: draft
- Since: 0.1.0
- Source: HAL-9377; `app.plugin-remove`; `studio.src-tauri.plugin-folder-commands`

When the page calls `plugin_folder_remove` with a plugin's name, the shell shall delete that plugin's folder from the plugins folder `pluginsFolder` names, in `@halonicjs/profile`, for the CLI's profile, and nothing else. If the name is not one plain folder name, then the shell shall refuse it before it touches the disk. If the plugin has no folder, or there is no plugins folder, then the shell shall succeed and create nothing. If the plugin's entry is a link, then the shell shall remove the link itself and never what it points at, and if it is a file, then the shell shall refuse it. If the plugins folder is a link or not a folder, then the shell shall refuse the call. Only the local main window shall be granted the command, in a capability of its own.

## Examples

- Given a plugins folder holding `acme-weather/plugin.yaml` and `acme-other/plugin.yaml`,
  when the page calls `plugin_folder_remove` for `acme-weather`,
  then `acme-weather` is gone and `acme-other` is untouched.
- Given `acme-weather` does not exist,
  when the page calls `plugin_folder_remove` for `acme-weather`,
  then it succeeds.
- Given `acme-linked` is a link to a folder outside the plugins folder,
  when the page calls `plugin_folder_remove` for `acme-linked`,
  then the link is gone and the folder it pointed at still holds its files.
- Given the name `../trust` or `acme-weather/src`,
  when the page calls `plugin_folder_remove`,
  then it is refused as `unsafe_path` and nothing is deleted.
