# memory.vcs-versions

- Status: active
- Since: 0.1.0
- Source: HAL-3245; routing note task 1 (HAL-3236); `Vcs` port v2

The memory Vcs shall take a snapshot as a new commit of every public file in its working tree, on top of the current commit, without changing the branch, the index or the working tree. `readAt` and `listAt` shall read a commit's files only, never a private entry the commit tracks, `null` for a file or folder the commit doesn't have, and refuse a version the repository doesn't have with `Unknown version <id>`. `rename` shall move a file, or every file under a folder, in the working tree, move the index entries of tracked files as they are, and refuse, changing nothing, when the old path doesn't exist, the new one does, or the new one is inside the old one.

## Examples

- Given `a.yaml` committed as "1", changed on disk to "2", and a new `b.yaml`,
  when a snapshot is taken,
  then at the snapshot `a.yaml` is "2" and `b.yaml` is listed, while the status, the log and the branch are the same as before.
- Given a snapshot, when `a.yaml` changes on disk again, then `readAt` at the snapshot still gives "2".
- Given tracked `agents/old.agent.yaml`,
  when it is renamed to `agents/new.agent.yaml`,
  then the status lists `agents/new.agent.yaml` as `renamed` from the old path, staged.
- Given `a.yaml` and `b.yaml`, when `a.yaml` is renamed to `b.yaml`, then it is refused and both are unchanged.
