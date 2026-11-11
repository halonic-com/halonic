# shell.item-tabs

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugins design 8.3 and decision D2 (HAL-1739); plugins UX checklist 9 and B3 (HAL-1952)

When a tab is on an item, whose place key is `kind/hub/id` as in a deep link, and a feature added that kind, the shell shall show the kind's `open` view on the tab's page, given the item and the context of the feature that added the kind. The view shall be imported the first time a tab shows an item of that kind. When no feature added the item's kind, the page shall stay empty.

## Examples

- Given _plugins_ adds the item kind `plugin-panel`,
  when a tab opens on `plugin-panel/this-computer/weather`,
  then its page is the kind's view for the item `weather`, with the context of _plugins_.
- Given an item whose id holds a `/`, such as `agent/acme/support/reply`,
  when a tab opens on it,
  then the view gets the hub `acme` and the id `support/reply`.
- Given no feature adds the kind `agent`,
  when a tab opens on `agent/acme/sorter`,
  then its page is empty.
