# paperclip.pr-watcher-pushed-after-approval

- Status: active
- Since: unreleased
- Source: HAL-17675; the board's decision on HAL-10 (24 Nov) to tell authors once when they push after an approval; HAL-18460, an approval that carries over a rebase

When the PR watcher checks an open task whose author holds it and has no run going, and one of its open pull requests is out of draft, doesn't conflict, and has a signed approval by someone other than its author whose head is not the current head, with no approval on the current head, the PR watcher shall comment once per approval on the task, starting "PR watcher: pushed after approval; this voids the approval.", naming the approved and the current head, and waking nobody. It shall not comment when it had reported a conflict or a base change on the approved head, because then the push was the fix the merge queue needed, nor when the approval carries over a rebase-only push (`paperclip.pr-watcher-rebase-carry`), which gets the carry-over comment instead.

## Examples

- Given pull request 5701 approved by Julian on `4999bbb` and now at `5701aaa`,
  when the watcher runs twice,
  then it comments once on the task, naming both heads, and wakes nobody.
- Given the same pull request with a green `ci-ok` on `5701aaa`,
  when the watcher runs,
  then it comments the warning and gives the task to its reviewer for a new approval.
- Given the watcher reported a conflict on `4999bbb`,
  when the watcher runs,
  then it says nothing.
- Given a pull request that conflicts, is a draft, is approved on its current head, or has no approval by anyone but its author,
  when the watcher runs,
  then it says nothing.
