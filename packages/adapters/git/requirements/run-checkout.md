# git.run-checkout

- Status: active
- Since: 0.1.0
- Source: HAL-3125 (step 3 of HAL-3023); plan section 4.5 ("its own git checkout, not a shared worktree")

The git adapter shall make a git checkout of its own for one agent run, inside the run's working folder, on the task's branch at a given full commit id. It shall borrow the shared repository's objects through `objects/info/alternates` instead of copying them, set `origin` to the given `https://` or `ssh://` address, leave `.git/hooks` empty, and only read the shared repository: its refs, index, config and hooks stay as they were. It shall refuse a folder that isn't absolute or empty, or that is inside the shared repository, a branch name that isn't plain, a start that isn't a full commit id, a remote the export refuses, and a commit the shared repository lacks, and in each case leave no folder it made. It shall remove a run's folder, whatever is in it.

## Examples

- Given a shared repository with one commit and an empty run folder,
  when a checkout is made on `acme/task-1` at that commit,
  then the folder has the commit's files, `acme/task-1` is checked out, and `objects/pack` and `objects` hold no copy of the commit.
- Given a checkout made that way,
  when a file is committed in it,
  then the shared repository's refs and objects are the same as before.
- Given a start commit the shared repository doesn't have,
  when a checkout is made,
  then it is refused and the folder isn't there.
