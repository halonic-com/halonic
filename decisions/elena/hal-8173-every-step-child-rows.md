# Decision: branch and for-each parts become indented child rows that name their step

- Approval: Liam asked for this in the review of #2385 (HAL-8211); the rows' words are a team decision under HAL-2282
- Kind: internal
- Task: HAL-8173

## What changes

`runs.run-view.step-groups` now says that the parts of a branch or for-each step are shown as
indented child rows, using the kit's child row from #2372. Their screen-reader label names the
step they belong to ("Branch translate, in the step Fan, …"). An example for the label is added.
No example is removed.

## Why

The kit's child row from #2372 now exists. A screen reader on a part row had no way to tell
which step the part belonged to.

## Covers

- runs.run-view.step-groups
