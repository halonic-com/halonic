# shell.overview.used-by

- Status: active
- Since: unreleased
- Source: HAL-1303 (T10, P4a); flow-library 3.1; HAL-12858; HAL-13066; HAL-13648

The overview page shall show an item's `usedBy` text on the right of its row, after the item's chips when it has both, in the feature's words, and shall show nothing there for an item without one. When the presentation is `phone`, the page shall instead end the line under the name with the `usedBy` text, after the item's `detail` and " · ", or give it that line alone when the item has no `detail`, while the chips stay on the right. When that line is too long for the row, the page shall cut the `detail` with an ellipsis and keep the `usedBy` text and its " · " whole. When the row can't hold the `usedBy` text whole even with the `detail` cut, the page shall give the `usedBy` text that line alone, whole and wrapping if it must, and shall not show the `detail` and its " · " on that row. The page shall never clip the `usedBy` text, nor start a line with " · ". The search shall not read it.

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
- Given a phone and a skill "Refund handling" with the detail "When an email asks for a refund" and `usedBy` "Not used yet",
  when the page shows,
  then the line under its name reads "When an email asks for a refund · Not used yet",
  and only "When an email asks for a refund" can be cut with an ellipsis.
- Given a phone and a skill with `usedBy` "Not used yet" and no detail,
  when the page shows,
  then the line under its name reads "Not used yet", and it isn't cut.
- Given a phone row 195px wide and a skill "Refund handling" with the detail "When an email asks for a refund" and `usedBy` "Not used yet",
  when the page shows,
  then the line under its name shows "Not used yet" whole,
  and no line starts with " · ".
