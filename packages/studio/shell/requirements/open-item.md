# shell.open-item

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugins design 8.3 and decision D2 (HAL-1739, HAL-1801); review of halonic#1831

The context the window gives a feature's views and commands shall let it open an item with `openItem`, as Ctrl K opens a found item: on the desktop in the active tab, or by going to the tab that shows it already, asking for focus on its page's `h1`; on a phone as a page. The window shall name the place as the item's kind names its tab (`tab.describe`), and by the item's id when the kind has no `tab` or no feature added the kind.

## Examples

- Given _plugins_ adds the kind `plugin-panel`, whose tab names the item `this-computer/weather` "Weather",
  when a command calls `openItem` for it on the desktop,
  then the active tab shows `plugin-panel/this-computer/weather` with the title "Weather".
- Given a tab shows `plugin-panel/this-computer/weather` and the active tab shows Home,
  when a command calls `openItem` for it,
  then that tab becomes the active one and no tab is added.
- Given no feature added the kind `agent`,
  when a command calls `openItem` for `agent/acme/sorter`,
  then the active tab shows `agent/acme/sorter` with the title "sorter".
