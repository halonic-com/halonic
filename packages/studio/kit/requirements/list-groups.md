# kit.list-groups

- Status: active
- Since: 0.1.0
- Source: HAL-6764 (spec list-columns-spec, section 1); T8-F1; a11y 13.1; checklist 1.2 (ux-checklists-t8-t9)

When the kit's `List` has `groups` in place of `rows`, it shall stay one named `grid`, named by its `label`, with one Tab stop, and draw each group that has rows under its own heading, drawn with `ListHeading` at `groupHeadingLevel` (default 3), in a row of the grid that spans every column and has no focusable cell, so the up and down arrow keys, Home and End pass over it. Each group's rows shall be a `rowgroup` named by its heading and sit in their own box, a 1px `border` with a 12px radius drawn by the cells, with the heading above the box, not inside it. A group with no rows shall not be drawn, heading and all. When the focused row is removed, focus shall go to the row that took its place, else to the one before it, across groups, never to a heading. When the presentation is `phone` or `flush` is set, the groups shall have no box, and a group's first row no line above it. While a grouped List loads, a heading bar shall stand above the skeleton's box.

## Examples

- Given a List with the groups Today (Sorter, Writer) and Yesterday (Checker) and focus on Writer,
  when the user presses the down arrow key,
  then focus is on Checker, and the "Yesterday" heading is an `<h3>` with no focusable cell.
- Given the same List with focus on Writer,
  when the user presses Home and then End,
  then focus is on Sorter and then on Checker.
- Given a group Last week with no rows,
  when the List renders,
  then no "Last week" heading is drawn.
- Given focus on Checker, Yesterday's only row,
  when Checker is removed,
  then the Yesterday heading is gone and focus is on Writer.
