# paperclip.pr-watcher-rebase-carry

- Status: active
- Since: unreleased
- Source: HAL-18460 (the board, 25 Nov: review is the bottleneck, and a rebase-only push still cost a review round); the Merger's carry-over by `git patch-id` (`paperclip.merge-control-carry-over`); the rebase-only rule of HAL-14809

When the PR watcher checks an open task whose author holds it with no run going, and a pull request on `halonic-com/halonic` has an approval by someone other than its author on an older head, and the PR watcher would warn about the push after that approval or hand the task to review, the PR watcher shall compare the pull request's changes at both heads as `paperclip.pr-watcher-rereview` does; when they match and that approval would count on the current head by the HAL-14809 rules (Liam's on any path, Julian's within his limits), it shall comment once per head on the task "PR watcher: only a rebase since the approval, so no new review round.", naming the approver and both heads, wake nobody, treat the pull request as approved on that head, and neither warn about the push nor hand the task to review for it. It shall not do so for a security pull request by its paths, a pull request on a `liam/` branch, or one it rebased off a merged base (`paperclip.pr-watcher-stack-rebase`); those, and any pull request whose changes differ or whose comparison fails, go to review as before. The PR watcher shall post no approval: the Merger's own patch-id check decides whether the approval counts.

## Examples

- Given pull request 5701 approved by Liam on `4999bbb`, now at `5701aaa` with the same changes and a green `ci-ok`,
  when the watcher runs twice,
  then it compares once, comments "PR watcher: only a rebase since the approval, so no new review round." once, and hands nothing to review.
- Given the same pull request with `ci-ok` still running,
  when the watcher runs,
  then it comments the carry-over instead of "pushed after approval; this voids the approval".
- Given Julian's approval on `4999bbb` and the path rules saying Julian,
  when the watcher runs,
  then the approval carries over; with the path rules saying Liam, the task goes to Liam.
- Given a changed line since `4999bbb`, or a change to `packages/x/src/sandbox/fence.ts`,
  when the watcher runs,
  then the task goes to the reviewer, and the security pull request isn't compared.
- Given the same rebase-only pull request on `halonic-com/cloud`, on a `liam/` branch, or rebased by the watcher off a merged base,
  when the watcher decides,
  then the approval doesn't carry over.
