# fs-node.plugin-folder-plain

- Status: active
- Since: unreleased
- Source: HAL-1743 (plugins P10, security review); Studio's `plugins_reader` refuses the same

The file system `PluginFolderWriter` shall place a plugin only into a plugins folder and a staging folder that are plain folders. When either is a symbolic link, a Windows junction or not a folder, `place` shall fail before it writes anything, and its sweep of the staging folder shall delete nothing through it.

## Examples

- Given a plugins folder that is a link to a folder elsewhere,
  when a plugin is placed,
  then it fails with an error saying the folder is a link, and the folder the link points to stays empty.
- Given a staging folder that is a link to a folder elsewhere holding `removed.<uuid>`, untouched for two hours,
  when a plugin is placed,
  then it fails, and `removed.<uuid>` is still in the folder the link points to.
- Given a plugins folder that is a file,
  when a plugin is placed,
  then it fails and the file is unchanged.
