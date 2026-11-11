# fs-node.plugin-folder

- Status: active
- Since: 0.1.0
- Source: HAL-1736 (plugins P3) plan, PR 2; `PluginFolderWriter` port v1 (halonic#1565)

The file system `PluginFolderWriter` shall write a plugin's files into a new folder in a staging folder beside the plugins folder (`<root>.staging` unless it is given another), never inside the plugins folder, and then rename that folder into the plugins folder as `<id>` in one step, so a reader never lists a half-written plugin. When writing or moving fails, it shall delete what it wrote and leave the plugins folder as it was; when replacing, it shall move the old folder out first and move it back if the new one can't be moved in. It shall look at the top of the plugins folder with `readdir` and `lstat`, compare names with `segmentAsOpened`, and never follow a symbolic link or a Windows junction: `place` never replaces one, and `remove` takes away the link itself and never what it points to, also for a link inside a removed plugin folder. `remove` shall act only on an entry whose name is exactly the id. The plugins folder shall be made on the first `place`, and `remove` shall do nothing when it isn't there. On its first `place`, it shall delete every folder in the staging folder whose name is one it makes (`<id>.<uuid>` or `removed.<uuid>`) and that hasn't changed for an hour, which is what a crash between moving and deleting leaves; it shall leave every other entry and ignore a failure to delete, as a leftover is never listed as a plugin.

## Examples

- Given a plugin placed, replaced and removed,
  when the profile folder is read,
  then it holds only the empty plugins folder and the empty staging folder beside it.
- Given `removed.<uuid>` and `weather.<uuid>` folders and a `notes` folder in the staging folder,
  when a plugin is placed less than an hour after they changed,
  then all three are still there; and when a new writer places one two hours later,
  then only `notes` is left, and a link inside a deleted folder is removed without touching what it points to.
- Given a staging folder that can't be made,
  when a plugin is placed,
  then it fails and the plugins folder is still empty.
- Given a file path `../escaped.txt`, or the id `..`,
  when a plugin is placed,
  then it is refused with a `RangeError` and nothing is written inside or beside the plugins folder.
- Given a plugin folder with a link inside it to a folder outside,
  when the plugin is replaced and then removed,
  then the folder outside and its files are unchanged.
- Given an entry `weather` that is a link to a folder outside the plugins folder,
  when `weather` is placed with `replace`, and then removed,
  then the place gives `taken`, the link is gone, and the folder outside is unchanged.
