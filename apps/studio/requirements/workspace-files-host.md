# studio.workspace-files-host

- Status: active
- Since: 0.1.0
- Source: HAL-10534; the Files feature's `FilesHost`

The Studio shall give the Files feature's file tree the workspace's files: every file path in the folder, with an unsaved new file listed and an unsaved delete left out. It shall list again, through `subscribe`, whenever the workspace's files change or a save finishes. It shall report every error and warning in the files, with unsaved changes applied, by file with line and column, and count them in the listing's marks; it shall report none when the files can't be checked. It shall watch the folder for changes made outside Halonic and take each batch in through the workspace's files: a file with no unsaved changes is reloaded, and a file with unsaved changes is held and marked as changed outside Halonic, as `changed` or, when it is gone, `deleted`, until the user settles it in Compare. It shall give both texts of a held file for Compare and settle it with the user's choice. It shall close the watch when disposed, and work without one when the store can't watch. When the folder can't be read, it shall reject with the reason in one sentence.

## Examples

- Given a folder with `workspace.yaml` and `hubs/p/hub.yaml` and an unsaved new `notes.md`,
  when the tree lists,
  then all three paths are listed.
- Given an unsaved delete of `workspace.yaml`,
  when the tree lists,
  then it isn't listed.
- Given the workspace's files change,
  when a tree is subscribed,
  then it is told once, and not after it unsubscribes.
- Given a folder that can't be read,
  when the tree lists,
  then the listing rejects with a one-sentence reason.
- Given `hubs/p/hub.yaml` has invalid YAML,
  when the host reports problems,
  then an error names that file with a line, and the listing marks the file with an error.
- Given the folder reports a batch of changes,
  when the workspace's files hold one of the files,
  then that file is marked as changed outside Halonic, and a subscriber is told.
- Given the held file is gone from the folder,
  when the batch is taken in,
  then it is held as `deleted`.
- Given a held file,
  when the user settles it,
  then it is no longer held or marked, and a subscriber is told.
- Given the host is disposed,
  when the watch was open,
  then the watch is closed.
