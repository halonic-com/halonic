# Decision: pr_status applies the Merger's scope rule to Julian's rebase-only re-approval

- Approval: Paperclip task HAL-18190; Liam approves this note in review
- Kind: internal
- Task: HAL-18190

`pr_status` and `my_prs` no longer count Julian's "re-approved on head `<new>` (rebase only,
range-diff vs `<old>`)" on a pull request outside his limits, even when Liam approved `<old>`.
The Merger's gate (`outsideJulianScope` in `merge-control/approval.ts`) never counted it there:
it waits for Liam, and carries Liam's own approval over a rebase only when the diff is identical.
Both now decide Julian's limits with the same `reviewerFor` rule.

## Covers

- `paperclip.pr-tools-reapproval`

## What changes

- The requirement `paperclip.pr-tools-reapproval` says Julian's rebase-only re-approval outside
  his limits doesn't count, and its first two examples change to match (the first now uses
  #5676's paths).

- The test "counts Julian's rebase-only re-approval on Liam's paths when Liam approved the head it
  names" becomes "doesn't count Julian's rebase-only re-approval on Liam's paths (#5676)" and
  expects the opposite outcome; the note for a re-approval naming a head Liam didn't approve gains
  the same "the Merger waits for Liam" ending.

## Why

On #5559 and #5676 `pr_status` showed the pull requests as approved while the Merger's gate
waited for Liam, so their authors believed they were waiting for the queue for about 3.5 hours.
