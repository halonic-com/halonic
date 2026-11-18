# kit.header-badge-sheet-rows

- Status: active
- Since: unreleased
- Source: component specs 15.3 and 20.2, flow-first-run 8; HAL-12729

When a Menu's items are shown in the kit's `HeaderBadgeSheet`, an item's `detail` shall show as a second line under its label and describe its row, its `tag` shall show as an outline tag named after the label, and the item with `checked` set shall show a tick, hidden from screen readers, and carry `aria-current`.

## Examples

- Given the items "Acme sample" (detail `~/Documents/Acme sample`, tag "Sample", checked) and "Beta" (detail `~/Work/beta`),
  when the sheet opens,
  then the first row reads "Acme sample" over its folder with the tag "Sample" and a tick, is named "Acme sample, Sample", is described by its folder and is the current one, and the second row has no tag and no tick.
