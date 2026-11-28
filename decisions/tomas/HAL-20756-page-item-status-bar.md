# Decision: a place's page can name the item it shows, and `activeItem` gives it

- Task: HAL-20756
- Approval: Liam OKed the plan on HAL-20756 (https://paperclip.halonic.com/HAL/issues/HAL-20756#comment-589990a7-8a59-42a4-80e3-25fb80d1a3e7). A team decision with no board card.
- Kind: internal

## What changes

A place's view in a desktop tab gets `setPageItem` on its context (`shell.page-item`). While the
tab is active and still shows that place, `activeItem` gives the item the page named, such as the
run the Runs page has open in its content pane, instead of `null`. The requirement
`shell.active-item` said `activeItem` is `null` whenever the tab shows a place; it now says so
only for a place whose page names no item. Its tests are unchanged and still pass; no test was
weakened or skipped.

## Why

With the Runs page's two columns (HAL-20729), a run opened from the list shows beside it rather
than in its own tab, so the status bar's spend item (`models.spend.month-line`) no longer knew the
run in view and left out "Est. this run …". This is the features' API, so `internal`.

## Covers

- shell.active-item
