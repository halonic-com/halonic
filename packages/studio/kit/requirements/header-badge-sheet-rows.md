# kit.header-badge-sheet-rows

- Status: active
- Since: unreleased
- Source: component specs 15.3 and 20.2, flow-first-run 8; HAL-12729; HAL-12962

When a Menu's items are shown in the kit's `HeaderBadgeSheet`, an item's `detail` shall show as a second line under its label and describe its row, its `tag` shall show as an outline tag named after the label, and the item with `checked` set shall show a tick, hidden from screen readers, and carry `aria-current`. A heading among the entries shall show as the kit's small section label over its group, naming the group's list, and a divider shall show as an 8px gap before the next group.

## Examples

- Given the items "Acme sample" (detail `~/Documents/Acme sample`, tag "Sample", checked) and "Beta" (detail `~/Work/beta`),
  when the sheet opens,
  then the first row reads "Acme sample" over its folder with the tag "Sample" and a tick, is named "Acme sample, Sample", is described by its folder and is the current one, and the second row has no tag and no tick.
- Given the workspace menu's entries: the heading "Recent", "Acme" and "Beta", a divider, "New workspace…" and "Open a folder…", a divider, "Workspace settings…" and "Close workspace",
  when the sheet opens,
  then it shows "Recent" as a section label naming a list of Acme and Beta, then New workspace… and Open a folder… after a gap, then Workspace settings… and Close workspace after another gap.
