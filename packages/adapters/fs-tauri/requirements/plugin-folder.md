# fs-tauri.plugin-folder

- Status: draft
- Since: 0.1.0
- Source: HAL-9377; `ports.folder-reader`, `ports.plugin-folder-writer`; `studio.src-tauri.plugin-folder-commands`

The Tauri plugin folder reader shall implement `FolderReader` over the shell's `plugin_folder_entries`, `plugin_folder_read` and `plugin_folder_location` commands, and the Tauri plugin folder writer shall implement `PluginFolderWriter`'s `remove` over `plugin_folder_remove`, naming no folder or path outside the plugins folder: the shell works the folder out itself. Both shall refuse an unsafe path or plugin id with a `RangeError` before they call the shell. The writer's `place` shall always reject, without calling the shell, with an error that says adding a plugin is a CLI action. A rejection that isn't the shell's refusal shape, such as a page without the capability, shall reject with an `unavailable` error that doesn't repeat the shell's text.

## Examples

- Given a plugins folder holding `acme-weather/plugin.yaml`,
  when the reader reads that path,
  then it gets the file's bytes and the shell was given no workspace.
- Given the writer and the id `acme-weather.`,
  when it removes the plugin,
  then it rejects with a `RangeError` and the shell is not called.
- Given the writer,
  when it places `acme-weather`,
  then it rejects and the message names `halonic plugin add`.
