# studio.src-tauri.plugin-folder-place

- Status: draft
- Since: 0.1.0
- Source: HAL-11571; `app.plugin-add`; `ports.plugin-folder-writer`; `studio.src-tauri.plugin-source`

When the page calls `plugin_folder_place` with a plugin's name and its files, the shell shall write the files as that plugin's folder in the plugins folder `pluginsFolder` names, in `@halonicjs/profile`, for the CLI's profile, and nothing else. The shell shall write them into a new folder beside the plugins folder and rename it into place, so the plugin is whole or not there, and shall remove that folder when anything fails. If any entry in the plugins folder has the name in any case, then the shell shall answer `taken` and write nothing, and with `replace` it shall replace only a real folder named exactly so. If the name is not one plain folder name every system opens the same way, or a file's path is unsafe, in the `.git` folder, the same file as another on a disk that ignores case, or both a file and a folder, or the plugin has more entries or bytes than a plugin may have, then the shell shall refuse it before it writes anything. The shell shall follow no link and never write through one, and if the plugins folder is a link or not a folder, then it shall refuse the call. The shell shall run nothing and leave the plugin untrusted. Only the local main window shall be granted the command, in a capability of its own.

## Examples

- Given an empty plugins folder,
  when the page places `acme-weather` with `plugin.yaml` and `src/index.js`,
  then the plugin's folder holds both files and nothing else is left beside the plugins folder.
- Given a plugin `Weather`,
  when the page places `weather`,
  then the answer is `taken` and `Weather` is unchanged.
- Given the name `../trust` or `acme/src`,
  when the page calls `plugin_folder_place`,
  then it is refused as `unsafe_path` and nothing is written.
- Given a file that can't be written halfway through,
  when the page places the plugin,
  then the call fails and no folder for the plugin is left in the plugins folder.
