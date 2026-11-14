/**
 * The shell's `plugin_folder_*` commands, behind `TauriPluginFolderReader`
 * and `TauriPluginFolderWriter`. They work in the profile's plugins folder,
 * which the shell works out itself: no call names a workspace or a path
 * outside the folder. `dir`, `path` and `plugin` are relative and
 * `/`-separated; `plugin` is one folder name.
 *
 * Reading never follows a link or opens a special file. Removing deletes
 * one plugin's folder, or the link itself. Nothing here writes a file:
 * adding a plugin is a CLI action.
 */
export const pluginFolderCommands = {
  /** `{ dir, limit, recursive }` → entries as for `folder_entries`; `[]` while no plugin is installed. */
  entries: "plugin_folder_entries",
  /** `{ path }` → the file's exact bytes as base64url, or `null` when there is no file. */
  read: "plugin_folder_read",
  /** `{ path }` → the entry's real location (`null` for the plugins folder), or `null` when there is none. */
  location: "plugin_folder_location",
  /** `{ plugin }` → whether there was a folder to show in the file manager (`plugin: null` shows the plugins folder). */
  reveal: "plugin_folder_reveal",
  /** `{ plugin }` → nothing. Deletes the plugin's folder; succeeds when there is none. */
  remove: "plugin_folder_remove",
} as const;
