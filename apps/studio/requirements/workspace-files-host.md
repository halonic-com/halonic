# studio.workspace-files-host

- Status: draft
- Since: 0.1.0
- Source: HAL-10534; the Files feature's `FilesHost`

The Studio shall give the Files feature's file tree the workspace's files: every file path in the folder, with an unsaved new file listed and an unsaved delete left out. It shall list again, through `subscribe`, whenever the workspace's files change or a save finishes. It shall give no marks until problems and outside changes are reported. When the folder can't be read, it shall reject with the reason in one sentence.

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
