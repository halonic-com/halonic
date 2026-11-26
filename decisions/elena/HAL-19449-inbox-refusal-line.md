# Decision: after a refused load, the open Inbox item gives the list line's reason

- Task: HAL-19449 (follow-up agreed in the review of #6409, HAL-19190)
- Approval: HAL-19449 asks for this change; Liam approves this note in review
- Kind: user-visible

## What changes

- `inbox.proposal-not-answering`: when the engine answered the Inbox's load with a refusal, the
  line over an open item (and the reason its unavailable buttons name) now gives the same reason
  as the line over the list, followed by "Showing what was read last.", instead of "The engine
  isn't answering. Showing what it said last." A load that never reached the engine, and a
  signed-out load, keep their lines. A new example says so.
- `inbox.stale-callout`: drops "in the same words as before", which `inbox.stale-age` changed;
  the callout's words are now those of `inbox.stale-age`.
- `inbox.stale-age`: adds the exception the code already had: signed out, the callout says only
  to sign in again, with no "Last updated" and no "Showing what was read last." (HAL-13371), with
  an example and a test.
- `studio-click-test.paperclip-steps`: step 8 now names the check it already made, that the
  seeded card isn't shown under a line that says the Inbox is showing an old list
  (`STALE_INBOX`), with an example.

No test is weakened or removed; the refused-load test in `proposal-not-answering.test.tsx` moved
its setup into a helper that the new test shares.

## Why

After #6409 the list line gave a refusal's reason, but an open item still said the engine isn't
answering, so the screen contradicted itself. The other three edits bring requirements in line
with what the code already does, as agreed in the review of #6409.

## Covers

- inbox.proposal-not-answering
- inbox.stale-callout
- inbox.stale-age
- studio-click-test.paperclip-steps
