# shell.item-tab-names

- Status: active
- Since: unreleased
- Source: first-run check L14, F19 (HAL-12730, HAL-12714)

When an item kind's tabs say, through their `subscribe`, that its items changed, the window shall ask the kind's `describe` for each tab whose current place is an item of that kind, and shall give each tab whose name differs the name `describe` gives now, everywhere that place appears, so a tab opened before its feature knew the item's name shows the name, not the id, once the feature knows it.

## Examples

- Given a tab opened on the workflow `support-reply` before Studio read it, so the tab says "support-reply",
  when Studio reads the workflow, named "Support reply",
  then the tab says "Support reply".
- Given a tab that says "Support reply",
  when the item kind says its items changed and the name is the same,
  then the tab is left as it is.
