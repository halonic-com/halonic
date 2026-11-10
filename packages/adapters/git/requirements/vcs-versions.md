# git.vcs-versions

- Status: active
- Since: 0.1.0
- Source: HAL-2607; HAL-3245 (`Vcs` port v2); the memory Vcs's `memory.vcs-versions`

The git Vcs shall take a snapshot as a new commit of every public file on disk that the repository doesn't ignore, on top of the current commit, through a copy of the index, without changing the branch, the index or the working tree, and leave no copy behind. `readAt` and `listAt` shall read a commit's regular files only, `null` for a file or folder the commit doesn't have, and refuse a version the repository doesn't have with `Unknown version <id>`. `rename` shall move a file, or a folder with everything in it, with `git mv` when the repository tracks it, and refuse, changing nothing, when the old path doesn't exist, the new one does, or the new one is inside the old one.

## Examples

- Given `a.yaml` committed as "1", changed on disk to "2", and a new `b.yaml`,
  when a snapshot is taken,
  then at the snapshot `a.yaml` is "2" and `b.yaml` is listed, while the status and the log are the same as before.
- Given a `.env` on disk that `.gitignore` doesn't ignore,
  when a snapshot is taken,
  then the snapshot has no `.env`.
- Given tracked `agents/old.agent.yaml`,
  when it is renamed to `agents/new.agent.yaml`,
  then the status lists `agents/new.agent.yaml` as `renamed` from the old path, staged.
