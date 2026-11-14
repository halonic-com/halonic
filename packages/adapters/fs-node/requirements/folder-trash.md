# fs-node.folder-trash

- Status: active
- Since: 0.1.0
- Source: HAL-6477 part A (plan decided by Liam in HAL-9301); the `Trash` port of `app.review-types`

The folder trash shall move a file out of the workspace into its own folder as one entry, `<trashId>.json`, holding the file's path and text, created with mode `600` in a folder with mode `700`. It shall write the entry before it removes the file, so a failure in between leaves the file in the workspace. When the file is missing, or isn't what `expected` says, it shall move nothing and say `changed-on-disk` with the file's text. `restore` shall write the file back to its path only where nothing is: when the path is taken it shall say `occupied` with the text there and keep the entry, and for an id it didn't give, or an entry already put back, it shall say `missing` without reading any file outside its folder. It shall delete the entry once the file is back.

## Examples

- Given the file `agents/old.agent.yaml` in the workspace,
  when it is moved to the trash and then restored,
  then it is back with its text, and the trash holds no entry.
- Given a file that changed since the caller read it,
  when it is moved to the trash with the digest the caller read,
  then it says `changed-on-disk` and the file is still in the workspace.
- Given a trashed file whose path now holds another file,
  when it is restored,
  then it says `occupied`, the other file is untouched and the entry is still there.
- Given the id `../../etc/passwd`,
  when it is restored,
  then it says `missing`.
