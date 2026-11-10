# fs-node.folder-reader

- Status: active
- Since: 0.1.0
- Source: HAL-1735 plan, PR 2 (decision D1, approved by Liam on HAL-4038: `locationOf` is async because it needs `realpath`); `FolderReader` port v1

The file system `FolderReader` shall list and read every entry under the folder it is given, looking at every segment with `lstat`, so that a symbolic link or a Windows junction is listed as a link and never followed, and anything that is neither a file, a folder nor a link is listed as `other` and never opened. It shall read a file from one handle opened without following a link where the system allows it, and refuse it when the handle isn't the same regular file `lstat` saw. Links above the folder and the folder itself shall be followed, so a folder reached through a link lists, reads and locates as the folder does. `locationOf` shall give the real path, with those links resolved. A folder that doesn't exist shall list nothing and have no location, and an entry removed while the folder is listed shall be left out.

## Examples

- Given a plugin folder reached through a link above it,
  when it is listed and a file in it is read,
  then its entries and the bytes are given, and `locationOf()` is the folder's real path.
- Given a folder that doesn't exist,
  when it is listed,
  then it gives `[]`, and `locationOf()` gives `null`.
- Given a pipe in the folder,
  when it is read,
  then it is refused with a `RangeError`, without opening it.
