# Decision: the never-list orders revisions by number and stops on a non-owner's newest revision

- Task: HAL-19796
- Approval: asked of Liam in the review of this pull request on HAL-19796; the change is the fix Julian asked for in his security review of #6470, confirmed by Liam on HAL-19479.
- Kind: internal

## What changes

- `auto-approvals.never-list`: `effectiveNeverList` orders revisions by Paperclip's revision number
  instead of by time and then text. It stops Studio when the newest revision isn't an owner's (A24),
  when a revision number is used twice or isn't a whole number from 1, and when a time isn't a date
  or a later revision is dated before an earlier one.
- In `packages/core/auto-approvals/src/never-list.test.ts`, two tests change:
  - "reads revisions written at the same time the same way, in any order" becomes "orders revisions
    written in the same millisecond by their number, in any order". It is stricter: it checks which
    revision is current, not only that the order of the list doesn't matter.
  - "ignores a revision no owner wrote, for content and for timing" becomes "ignores an older
    revision no owner wrote": an owner's revision now follows the agent's one, because a newest
    revision by an agent stops Studio (new test "stops on its own when the newest revision isn't an
    owner's").
- `auto-approvals.card` gains a section that says what the code already does: every path class
  other than `ordinary` blocks, and an unknown type, source or actor type fails closed. No behaviour
  changes.

## Why

Ordering by time and text could drop the current revision's entries 24 hours early when two owner
revisions shared a millisecond, and a time that wasn't a date ended the previous revision's 24 hours
at once (Julian's review of #6470). Paperclip numbers every revision of a document, so the number is
a server fact that orders them without a tie. Each new failure stops Studio; none lets anything more
through.

## Covers

- auto-approvals.never-list
- auto-approvals.card
- packages/core/auto-approvals/src/never-list.test.ts
