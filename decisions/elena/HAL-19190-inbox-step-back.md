# Decision: click-test step 8 goes back to the list after the answer and names the failed load

- Task: HAL-19190 (follow-up agreed in the review of #6548)
- Approval: Liam approves this note in review
- Kind: internal

## What changes

- `studio-click-test.paperclip-steps`, item 8: adds what step 8 has checked since #6548, that the
  list after the answer shows none of the stale lines and that a `STALE_INBOX` failure names the
  load the line's `data-failed` gives (`inbox.stale-source`). It also adds that step 8 goes
  **Back to Inbox** when the answered card stays open, with an example and two tests.

The requirement only gains checks. No test is weakened or removed.

## Why

In run 45834340178 the answered Paperclip card stayed open with its "Answered at" line, which in
the click test's narrow window hides the list. Step 8 failed as `NO_ANSWERED_LINE` and never read
the stale line's `data-failed`, so the run didn't name the load that fails in the installed app,
the open question on HAL-19190. Nora's review of #6548 asked for item 8 to describe the check
after the answer.

## Covers

- studio-click-test.paperclip-steps
