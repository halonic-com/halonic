# ports.plugin-folder-writer

- Status: active
- Since: 0.1.0
- Source: HAL-1736 (plugins P3) plan, step 3; the plugins ADR (`docs/adr/2026-11-09-plugins.md`, section 6: plugins are copied into the profile's plugin folder, never into a workspace); P2 decision D5 on HAL-1735 (a plugin's folder is named exactly its id)

The ports package shall have a `PluginFolderWriter` port with a `location`, a `place` method that writes a plugin's files as the folder named by its id in the profile's plugins folder and gives `placed` or `taken`, and a `remove` method that removes one entry at the top of the plugins folder. `place` shall make the caller say whether a plugin already there is replaced. The package shall also have `checkPluginId`, which refuses an id that isn't one folder name or that Windows or macOS would open as another entry (a `:`, a trailing dot or space, a `~` followed by a digit, a device name such as `con`, or a control character), and `checkPluginFiles`, which also refuses an unsafe file path, a path segment the id rule refuses, two paths that are the same file on a disk that ignores case, and a path that is a file and also a folder above another file in any case, both with a `RangeError`, for adapters to call before they touch storage.

The port's documentation shall state that the plugins folder lives in the person's profile and never in a workspace; that `place` writes whole or not at all, beside the plugins folder and then moved into place, so no reader lists a half-written plugin; that "the same name in any case" means the same after `segmentAsOpened`; that an id already there in any case is `taken` unless it is a real folder with exactly that id and the caller replaces it; that an unsafe id or path is refused with a `RangeError` before anything is written; that `remove` removes only the entry with exactly the id; that refusing an empty plugin is the plugin service's job; and that nothing is written or deleted through a link.

## Examples

- Given the `PluginFolderWriter` port,
  when its members are read,
  then they are exactly `location`, `place` and `remove`.
- Given `PluginFolderWriter.place`,
  then it takes an id, the files by path and the options, and returns `placed` or `taken`.
- Given `PlacePluginOptions` without `replace`,
  when it is compiled,
  then it doesn't compile.
- Given the id `..`, `a/b`, `a\b`, `weather:x`, `weather.` or `con`,
  when `checkPluginId` checks it,
  then it throws a `RangeError`; `Weather-2` passes.
- Given files `a.js` and `A.js`,
  when `checkPluginFiles` checks them,
  then it throws a `RangeError` naming both.
- Given files `backend` and `backend/index.js`,
  when `checkPluginFiles` checks them,
  then it throws a `RangeError` naming both.
