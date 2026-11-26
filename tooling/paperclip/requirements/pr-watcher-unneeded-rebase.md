# paperclip.pr-watcher-unneeded-rebase

- Status: active
- Since: unreleased
- Source: HAL-18722; the CI research sweep of 25 Nov (rebases onto `main` were 19% of the pushes after a pull request was ready and the costliest cause, and 21 of 23 re-approvals gave no reason for the rebase); the rule to rebase after an approval only for a conflict or when the queue asks

When the PR watcher compares an approved pull request's changes at its approved head and its current head (`paperclip.pr-watcher-rereview`) and they match, and it had reported no conflict, base change or held head on the approved head, and no task comment has a queue manager wake naming the pull request and the approved head ("Queue manager: #123 (head `abc1234…`)"), the PR watcher shall comment once per head on the task "PR watcher: unneeded rebase after approval (no conflict, no queue request).", naming the approver and both heads, and wake nobody. It shall not do so for a pull request it rebased itself off a merged base (`paperclip.pr-watcher-stack-rebase`), nor for a security pull request by its paths, which it doesn't compare, nor on a repository without a merge queue (`halonic-com/cloud`), where a branch behind `main` can't merge (HAL-19791).

## Examples

- Given pull request 5701 approved by Liam on `4999bbb`, now at `5701aaa` with the same changes,
  when the watcher runs twice,
  then it comments "PR watcher: unneeded rebase after approval (no conflict, no queue request)." once and wakes nobody.
- Given the watcher reported a conflict on `4999bbb`, or the queue manager's wake "Queue manager: #5701 (head `4999bbbbb`) was removed from the merge queue" is on the task,
  when the watcher runs,
  then it says nothing about the rebase.
- Given the same rebase on `halonic-com/cloud`, which has no merge queue,
  when the watcher runs,
  then it says nothing about the rebase.
- Given a changed line since `4999bbb`,
  when the watcher runs,
  then it says nothing about the rebase.
