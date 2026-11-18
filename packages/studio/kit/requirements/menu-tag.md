# kit.menu-tag

- Status: active
- Since: unreleased
- Source: flow-first-run 8 ("Recent and workspace picker tag: Sample"), component specs 14; HAL-12729

When a Menu item has a `tag`, the kit shall show it after the item's label as an outline tag, hidden from screen readers, and the item's name shall end in a comma and the tag's words.

## Examples

- Given the item "Acme sample" with the detail `~/Documents/Acme sample` and the tag "Sample",
  when the menu opens,
  then its row shows "Acme sample" with an outline tag "Sample" after it, and is named "Acme sample, Sample".
- Given an item with no tag, then its row has no tag.
