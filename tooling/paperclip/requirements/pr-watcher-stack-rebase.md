# paperclip.pr-watcher-stack-rebase

- Status: active
- Since: unreleased
- Source: HAL-18031; the board on HAL-17922 (25 Nov 00:58 UTC); Julian's OK on HAL-18035; HAL-18201, the rebase-only re-review goes to the reviewer of its paths

When the PR watcher would wake a task's holder because GitHub moved a pull request to `main` or because it conflicts, and the board turned the stack rebase on, the PR watcher shall, once per head, ask GitHub to rebase it on `main` if it is in the same repository, its last base change came from a branch whose pull request GitHub says merged, and its head still holds that pull request's last head; it shall wake nobody when GitHub takes the rebase, wake the holder once with the files and the `git rebase --onto` command when GitHub refuses, and never ask again for a head it already tried.

## Examples

- Given #5674 moved to `main` after #5659 merged, with Liam's approval on its head,
  when the watcher runs,
  then it sends one rebase request, wakes nobody and notes it on the task; and once the new head is green, the task goes to the reviewer of its paths (Liam, whose paths it changes) as a rebase-only re-review.
- Given GitHub refuses the rebase with a conflict,
  when the watcher runs twice,
  then the holder gets one wake that names the files and `git rebase --onto origin/main <base head>`.
- Given a head the watcher already tried,
  when it runs again, even before GitHub shows the new head,
  then it neither reads, rebases nor wakes.
- Given a pull request whose base was closed without merging, a fork's pull request, one not on `main`, or one its author already rebased,
  when the watcher runs,
  then it sends no rebase and wakes the holder as before.
- Given a dry run, a task whose author is running, or the stack rebase turned off,
  when the watcher runs,
  then it sends no rebase.
