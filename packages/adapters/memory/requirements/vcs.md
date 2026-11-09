# memory.vcs

- Status: active
- Since: 0.1.0
- Source: HAL-181; `Vcs` port v1

The memory Vcs shall keep a repository in memory over any `DefinitionStore` as its working tree. A new repository shall have no commits: its log is empty, a branch created from it has no commits either, and pushing it is refused. `init` on a repository shall change nothing. `MemoryVcs.clone` shall refuse a branch the remote doesn't have, and `pull` shall refuse when the remote has lost the upstream branch. Checking out a branch or pulling shall be refused while a tracked file has changes, staged or not, or while an untracked file is in the way of a file the target commit has, and shall remove files the target commit doesn't have. Its diffs shall be unified diffs in git's format, marking a last line without a newline with `\ No newline at end of file`, so a change to only the final newline shows.

## Examples

- Given a new repository with no commits,
  when its log is read, a branch is created and the branch is pushed,
  then the log is empty, the new branch's log is empty too, and the push is refused.
- Given a remote that has only `main`,
  when it is cloned at `develop`,
  then the clone is refused.
- Given a repository with an unstaged change to a tracked file,
  when another branch is checked out,
  then it is refused and the change is still there.
- Given an untracked `b.yaml` on `main` and a branch that has a `b.yaml`,
  when that branch is checked out,
  then it is refused and the untracked `b.yaml` is unchanged.
- Given a branch that added `b.yaml`,
  when `main` is checked out,
  then `b.yaml` is gone from the working tree.
