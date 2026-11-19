# kit.list-chevrons

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.12; design-source-control (HAL-611) 3

When the kit's `List` has `chevrons` and the presentation is `phone`, each row shall end in a 20px chevron in `fg-subtle`, hidden from screen readers, and a row's trailing chip shall start its meta line. When the presentation isn't `phone`, the List shall draw its rows as it does without `chevrons`.

## Examples

- Given a phone List with `chevrons` and a row "Version 2" with the meta line "You · 09:12" and a trailing chip "Not shared yet",
  then the row ends in a chevron hidden from screen readers and its meta line starts with the chip.
- Given the same List on desktop,
  then the row has no chevron and the chip is on the right.
