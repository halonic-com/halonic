# Decision: a place with its own list draws it in the window's list column

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-21051 (Liam's OK on the plan for HAL-21050)
- Kind: user-visible

`shell.rail-frame` gets new lines and examples. A place can now bring its own list column
(`PlaceContribution.listColumn`). From 900px the window shows that list in its list column, in place of
the places, and the place's page leaves the list out, so the window has one list column, as in the
approved mockup (v26 on HAL-20617). Under 900px the Places drawer keeps the places and the page draws the
list. The window keeps one open item for each tab's place, shared by the list column and the page.
Nothing else in the requirement changes, and no test was weakened or removed.

## Covers

- shell.rail-frame
