# shell.overview.used-by

- Status: active
- Since: unreleased
- Source: HAL-1303 (T10, P4a); flow-library 3.1; HAL-12666 (a11y-check-2 P3)

The overview page shall show an item's `usedBy` text on the right of its row, after the item's chips when it has both, in the feature's words, and shall show nothing there for an item without one. On a phone, a `usedBy` text shall instead end the line under the name, after the item's detail and " · ", so the detail reads first and the `usedBy` text is what gets cut. The search shall not read it.

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
- Given an item with the chip "1 running" and the `usedBy` text "Used by 1 agent",
  when the page shows,
  then its row ends with "1 running" and then "Used by 1 agent".
- Given a routine with the detail "Mondays at 09:00 → Weekly report", the `usedBy` text "next Mon 09:00" and a ⋮ menu,
  when the page shows on a phone,
  then its row's second line reads "Mondays at 09:00 → Weekly report · next Mon 09:00", and the chips alone are on the right or start that line.
