# shell.gone-item-tabs

- Status: active
- Since: 0.1.0
- Source: HAL-5696; plugins UX checklist 9 and G7 (HAL-1952)

When an item kind's tabs say, through their `subscribe`, that its items changed, the window shall ask the kind's `exists` for each tab whose current place is an item of that kind, and shall close each tab whose item no longer exists the same way Mod W closes a tab, so the tab to its right becomes active, else the one to its left, and Mod Shift T brings it back. A tab whose item still exists, and a tab that shows the item only further back in its history, shall stay open.

## Examples

- Given tabs "Agents", "Weather" and "Translate" on the plugin panels `weather` and `translate`, "Weather" active,
  when the _Weather_ plugin is removed,
  then "Weather" closes, "Translate" is active, and "Agents" and "Translate" stay open.
- Given a tab that went from the Weather panel to Agents,
  when the _Weather_ plugin is removed,
  then the tab stays open on Agents.
