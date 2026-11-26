# Decision: merge control reads an approval that opens its comment as the live Merger does

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18424 (the board's switch-over checklist via ci-fasttrack, 26 Nov 11:30 UTC, point 1: count Nora and Julian approvals the way the live gate does; Chief agreed 11:30 UTC)
- Kind: internal

A signed approval line that is the first line of its comment now counts even when the findings below it use change words. On 26 Nov the gate refused four approvals the live Merger counted: Julian's on #6452 and Nora's on #6453, #6482 and #6495, each because the findings said "none blocking" or similar. The live gate never reads an approval comment as blocking itself (`isBlock`: a text whose first line approves isn't a block).

## What changes

- `paperclip.merge-control-signed-approval`: "and the comment holds no change request" gains "A comment whose first line is the approval line shall not be read for change words". A new example replays #6452. In `signed.test.ts` a new case covers it; Julian's six HAL-17946 cases stay as they were, and the new case also keeps change words above the approval line voiding it.
- The security sign-off (`security-signoff.ts`) still reads every line for change words. No other test or `expect` is removed or weakened.

## Why

- **Same rules as the live Merger.** The shadow comparison counts every difference, and these four would have been dequeued while approved.
- **Reviewers write the approval first** (team rule 19), with findings tagged below it. A finding that blocks comes with "changes requested", not an approval line.

## Covers

- paperclip.merge-control-signed-approval
