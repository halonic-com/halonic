# shell.help-menu

- Status: active
- Since: unreleased
- Source: HAL-13433 (first-run build 5, build notes 4; first-run-flow 10.2 R8); first-run-progress 4.5 (HAL-7986), "the one Help place"

The shell shall let a feature add a group of items to the Help menu only through the point `help.add`. Where any group has items, the sidebar shall show **Help** just above **Settings**, under the same divider, as a button that opens the Help menu. The menu shall list each group's items in the groups' `order`, then `id`, under the group's title when it has one, with a divider between groups, and picking an item shall call its `run`. A group with no items now shall be left out, and with none left the sidebar shall show no Help row.

## Examples

- Given _first-run_ adds the group "First run" with **Show the guide** and **Start over**,
  when the user opens **Help** in the sidebar,
  then the menu shows the heading "First run" over the two items.
- Given two groups, "Check this computer" (order 10, no title) and "First run" (order 20),
  when the menu opens,
  then **Check this computer** comes first, then a divider, then "First run" and its items.
- Given every group has no items now,
  when the sidebar draws,
  then there is no Help row.
