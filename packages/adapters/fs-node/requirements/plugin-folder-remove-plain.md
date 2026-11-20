# fs-node.plugin-folder-remove-plain

- Status: active
- Since: unreleased
- Source: HAL-13157 (follow-up to HAL-12622); the same rule as `fs-node.plugin-folder-plain`, for `remove`

The file system `PluginFolderWriter` shall remove a plugin only from a plugins folder that is a plain folder. When the plugins folder is a symbolic link, a Windows junction or not a folder, `remove` shall fail with a `conflict` error saying so, with the fix "Replace it with a plain folder, then try again.", and delete nothing.

## Examples

- Given a plugins folder that is a link to a folder elsewhere holding `weather`,
  when `weather` is removed,
  then it fails with an error saying the plugins folder is a link, and `weather` is still in the folder the link points to.
- Given a plugins folder that is a file,
  when `weather` is removed,
  then it fails with an error saying the plugins folder isn't a folder, and the file is unchanged.
