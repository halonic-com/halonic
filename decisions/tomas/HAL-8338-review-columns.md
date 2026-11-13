# Decision: Approve this version keeps the review open while other tools wait

- Approval: Liam decided this on HAL-8338 as owner of the review flow under the board-approved frames (HAL-2282 rule); a team decision with no board card
- Kind: user-visible
- Task: HAL-8338

## What changes

`library.listed-tools-review-states` said that **Approve this version** closes the review with the
toast for one approved tool. The frames make **Approve none** the only explicit way out, and closing
early would hide the tools that still stay off. The requirement now says:

- the approved tool moves to Approved and the review stays open while any other tool waits for a
  decision;
- the review closes with the toast once nothing is left to decide.

The one example about closing early is replaced by two examples, one for each case. No other example
changes. The tests that name the requirement assert both.

## Covers

- library.listed-tools-review-states
