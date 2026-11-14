# shell.overview.used-by

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (T10, P4a); flow-library 3.1

The overview page shall show an item's `usedBy` text on the right of its row, in the feature's words, and shall show nothing there for an item without one. The search shall not read it.

## Examples

- Given a skill "Acme refunds" with `usedBy` "Used by 2 agents",
  when the page shows,
  then the row of "Acme refunds" ends with "Used by 2 agents".
- Given a skill without `usedBy`,
  when the page shows,
  then its row has no text on the right.
- Given the `usedBy` text "Used by Support",
  when the user searches "support",
  then the page shows no match for that row.
