# Decision: a skip any same-reason row holds adds nothing

- Approval: asked for by the package owner (Liam) in his review of #1032 on [HAL-3553](/HAL/issues/HAL-3553), follow-up 2; he approves this note in review
- Kind: internal
- Task: HAL-2524

## What changes

`app.skip-records` said "A range the newest row already holds shall add nothing". It now says
"A range that a row with the same reason already holds shall add nothing", with an example.
`addSkips` checks every row instead of only the newest.

## Why

One tick can add two rows for a routine (`window` and then `cap` or `latest`). When that tick
is recorded twice, as when two hosts record it, only the newest row was checked, so the older
range was added again as a new row, and then the newer one too. The new test fails before the
change and passes after it.

No test was weakened or removed.

## Covers

- app.skip-records
