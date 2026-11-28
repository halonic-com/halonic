# Decision: the Changes list moves into the window's list column

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-21051 (Liam's OK on the plan for HAL-21050)
- Kind: user-visible

`source-control.list-column` gets new lines and one changed example. From 900px the window draws the
Changes list in its own list column (`shell.rail-frame`), so Changes no longer shows two list columns
beside the rail (HAL-21050). The page is then the content pane alone, under a screen-reader `h1`; the
list's heading is an `h2`. Without the window's column, as under 900px, the page keeps its own list
column, so the example of the kit's list-column size now names that case. A folder without history
shows its page in the window's list column, with "Changes" alone in the pane. No test was weakened or
removed.

## Covers

- source-control.list-column
