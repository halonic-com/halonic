# paperclip.pr-watcher-rereview

- Status: active
- Since: unreleased
- Source: HAL-17759; green pull requests waited 2 to 6 hours for a new review after a push (24 Nov), and the rebase-only re-approval of HAL-14809 (board, 22 Nov)

When the PR watcher hands a task to its reviewer and one of its pull requests has an approval by someone other than its author on an older head, the PR watcher shall compare the pull request's changes from its merge base at the approved head and at the current head on GitHub, with GET requests only. When they match, the handoff comment shall say the push was only a rebase and name the approved head, and a pull request Liam approved shall go to Julian, with the re-approval line Julian posts after checking `git range-diff`; when they differ, or the comparison fails, the comment shall name both heads, and the pull request shall go to the reviewer of its paths. The watcher shall never post an approval itself, and shall leave a task whose author's newest comment has the line `PR watcher: own review task` (a security or release pull request) with its author.

## Examples

- Given pull request 5701 on Liam's paths, approved by Liam on `4999bbb`, now at `5701aaa` with the same changes and a green `ci-ok`,
  when the watcher runs,
  then it gives the task to Julian with "only a rebase since Liam's approval on `4999bbb`" and the line "Julian: re-approved on head `5701aaa` (rebase only, range-diff vs `4999bbb`)".
- Given the same pull request with a changed line since `4999bbb`,
  when the watcher runs twice,
  then it gives the task to Liam once, naming `4999bbb` and `5701aaa`.
- Given the same pull request and GitHub refusing the comparison,
  when the watcher runs,
  then it gives the task to Liam.
- Given the same rebase-only pull request and the author's newest comment with the line `PR watcher: own review task`,
  when the watcher runs,
  then it leaves the task with its author and compares nothing.
- Given the approved head's change and the current head's change differ only in their hunk line numbers,
  when the watcher compares them,
  then they match; a file GitHub lists without a patch makes them differ.
