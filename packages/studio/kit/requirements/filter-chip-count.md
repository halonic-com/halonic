# kit.filter-chip-count

- Status: active
- Since: unreleased
- Source: HAL-20805, split out of HAL-20734; the new design's list column, chips with a count ("Unread 2"), part recipes on HAL-20672; base component specs 23 A10

Where a one-of `FilterChips` option has a `count`, the chip shall show the count after its label as the kit's count chip in the count's tone (`accent` when it has none), with the number hidden from screen readers, who hear the count's name after the chip's label. While the chip is on, or filled on hover or press, the count shall lay its soft fill over `surface` as one opaque box, so its text keeps 4.5:1 on the chip's fill in light and dark. Picker options shall take no count.

## Examples

- Given the option "Connectors" with the count 1, tone `danger`, named "1 problem",
  when the row renders,
  then the chip shows "Connectors" and a danger count chip with 1, and a screen reader names it "Connectors, 1 problem".
- Given the option "Unread" with the count 2 and no tone,
  when the row renders,
  then the count chip is `accent`.
- Given "Connectors", with its count, is the chip that is on,
  when the row renders,
  then the count chip takes the opaque over-surface fill, not its see-through soft fill.
- Given the option "Skills" with no count,
  when the row renders,
  then the chip shows only "Skills".
