# shell.item-gone

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2, PR 6c); microcopy 2 "Item gone" and 22 F13 `not_found`; state coverage SH15

When a tab or a link leads to an item that isn't in this workspace any more, the shell shall show the Empty state "This _kind_ isn't in this workspace any more." with the button **Go to _place_**, which opens the place that lists that kind, and shall move focus to its title when it shows. An item moved to the trash while its tab is open is not gone: its feature shows the "moved to the trash · Undo" strip instead.

## Examples

- Given a tab for a run that isn't in this workspace any more,
  when it shows,
  then it says "This run isn't in this workspace any more.", focus is on that title, and Go to Runs opens Runs.
