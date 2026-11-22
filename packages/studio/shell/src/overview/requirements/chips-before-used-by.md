# shell.overview.chips-before-used-by

- Status: draft
- Since: unreleased
- Source: HAL-15338; Routines UX check RT9 (HAL-15304); flow-routines 5.1; component specs section 6, revision 11

When the presentation is `phone` and an item asks for its chips before its `usedBy` text, the overview page shall show the item's `detail` under its name on up to two lines, then a last line that starts with the item's chips and ends in its `usedBy` text, wrapping rather than cut. On desktop such an item's row shall not change.

## Examples

- Given the routine "Morning replies" with the detail "Weekdays at 07:30 (Europe/Amsterdam) → Support reply", the chip "Needs you" and `usedBy` "next Mon 07:30", on a phone,
  when the page shows,
  then the detail has a line that holds up to two lines, and the last line reads "Needs you" then "next Mon 07:30".
- Given the same routine with no chip, then its last line reads "next Mon 07:30" alone.
- Given the same routine on desktop, then the chip and "next Mon 07:30" are on the row's right, as for any item.
