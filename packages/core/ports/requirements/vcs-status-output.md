# ports.vcs-status-output

- Status: active
- Since: 0.1.0
- Source: HAL-9757; review of PR 2785 (HAL-9755); `Vcs` port v2

The ports package shall export `parseStatus`, which shall read the output of `git status --porcelain=v2 -z`, with or without `--branch`, into a `VcsStatus`: the branch, upstream, ahead and behind counts from the header lines, and one change per path for an ordinary, renamed, conflicted or untracked record. A path changed both in the index and in the working tree shall give two changes, one staged and one not. A path with spaces shall be kept whole, and a rename shall carry its old path in `from`. Output with no header lines shall give no branch and no upstream. Every consumer of this output, the git adapter and Studio's changes list, shall use this one parser.

## Examples

- Given `# branch.head main`, `# branch.upstream origin/main`, `# branch.ab +2 -1` and a record `1 MM … hub.yaml`,
  when it is read,
  then the branch is `main`, it tracks `origin/main`, it is 2 ahead and 1 behind, and `hub.yaml` has a staged and an unstaged change.
- Given a rename record followed by the old path, when it is read, then the change is `renamed` with `from` set to the old path.
- Given an empty answer, when it is read, then there are no changes.
