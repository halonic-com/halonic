# fs-node.folder-trash

- Status: active
- Since: 0.1.0
- Source: `Trash` of `@halonicjs/app`; HAL-6477; the file rules of `fs-node.agent-placement-store-files`

The fs-node trash shall keep what it takes out of a workspace's store as one JSON file per entry, named by an id the trash made, in a folder given to it, private to the user, holding the file's workspace path and text. `moveToTrash` shall take the file out of the store only after its entry is on disk, and only when the file still holds what the caller expected: for a file that is gone or changed it shall change nothing and say `changed-on-disk` with the text now. `restore` shall write the text back to its path only when nothing is there, say `occupied` with the text found otherwise, and say `missing` for an entry that isn't there, was put back already, or whose id isn't one the trash made; it shall delete the entry once the file is back. An entry that is a link, or isn't a path and a text, shall make `restore` throw.

## Examples

- Given a file in the store,
  when it is moved to the trash and restored,
  then the file is back with its text and the entry is gone.
- Given a file that changed since the caller read it,
  when it is moved with the old digest,
  then it stays in the store and the answer is `changed-on-disk`.
- Given a file moved to the trash and another one written at its path since,
  when the first is restored,
  then the answer is `occupied`, the other file is unchanged and the entry stays.
- Given an id of `../x`,
  when it is restored,
  then the answer is `missing`.
- Given an entry that is a symbolic link to a file outside the trash,
  when it is restored,
  then `restore` throws.
