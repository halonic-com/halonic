# Decision: pr_status reads re-approvals in the same forms as the Merger

- Approval: Paperclip task HAL-18167; Liam approves this note in review
- Kind: internal
- Task: HAL-18167

`pr_status` and `my_prs` now read "approved on head", "re-approved on head" and "approved again on
head" as the Merger's gate does (HAL-15553). The range-diff part after a re-approval stays optional
and still lets Julian's re-approval count outside his limits when Liam approved the head it names.

## Covers

- `paperclip.pr-tools-reapproval`

## What changes

- The requirement `paperclip.pr-tools-reapproval` reads a re-approval without the range-diff part
  as a plain approval instead of ignoring it, and its example changes to match.

- The test "doesn't count a re-approval without Liam's approval on the named head or without the
  range-diff" no longer expects a bare `re-approved on head` line to be ignored when it's read. It
  now checks the outcome that matters: Julian's bare re-approval on Liam's paths doesn't count
  ("outside Julian's limits").

## Why

Liam's `re-approved on head bb12791` on #5908 passed the Merger's gate while `pr_status` showed
the pull request as not approved, so agents waited for a review that was already there.
