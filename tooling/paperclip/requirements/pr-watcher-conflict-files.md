# paperclip.pr-watcher-conflict-files

- Status: active
- Since: unreleased
- Source: HAL-17922; PRs that conflicted with main after parallel pushes cost their authors a run each to find where (HAL-17762, HAL-17869, HAL-17873, HAL-16803, 24 Nov)

When the PR watcher wakes an author because a pull request conflicts with its base branch, the PR watcher shall name in that line of its comment the files both the pull request and its base branch changed since the pull request branched off, at most 10 of them followed by how many more there are, read with GET requests to GitHub only for a conflict it hasn't reported yet; when that read fails, the PR watcher shall still wake the author, without the file list.

## Examples

- Given pull request 4614 conflicting with `main`, outside the merge queue, where it changed `README.md` and `src/worker.ts` and `main` changed `src/worker.ts` and `docs/x.md` since it branched,
  when the watcher runs twice,
  then the first run comments once, naming `src/worker.ts` and not `README.md` or `docs/x.md`, and the second run adds no comment.
- Given the same conflict and GitHub refusing the file list,
  when the watcher runs,
  then it still comments that the pull request conflicts, without naming files.
- Given 12 files both sides changed,
  when the watcher comments,
  then it names the first 10 and adds "and 2 more".
