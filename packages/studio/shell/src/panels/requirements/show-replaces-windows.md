# shell.panels.show-replaces-windows

- Status: active
- Since: unreleased
- Source: HAL-17619 (T14 PR 13d-A, plan approved on HAL-17614); flow-assistant 5.7 (HAL-647); HAL-17348 (the Build chat's `show` tool)

When a feature calls its context's `showItem` with an item, the desktop window shall show the item next to what the user is doing, without moving the focus: when the active tab's page takes the item (`useItemCardTaker`), as a stacked card on that page; otherwise in its own tab next to the active one, which becomes active, or, when a tab shows the item already, by making that tab active, so no place opens in two tabs. It shall answer where it showed the item and the name the item's kind gives it with `tab.describe`. When no feature added the item's kind, or the kind's `tab.exists` says the item isn't there, the window shall change nothing and answer `unknown`. Only the desktop window's contexts shall have `showItem`.

## Examples

- Given the agent page of "Mail triage" in the active tab, which takes the agents of its team,
  when a feature shows the agent "Writer" of its team,
  then "Writer" opens as a card on that page, no tab opens, and the answer is a card named "Writer".
- Given Home in the active tab and the focus in the side panel,
  when a feature shows the run `r42`,
  then a tab on `r42` opens right after Home and becomes active, the answer is a tab named as the run's kind names it, and the focus is still in the side panel.
- Given a tab on `r42` behind the active tab,
  when a feature shows `r42`,
  then that tab becomes active and no second tab opens on `r42`.
- Given no feature adds the kind `report`, or the run kind says `r99` isn't there,
  when a feature shows `report/acme/q3` or `run/acme/r99`,
  then nothing changes and the answer is `unknown`.
- Given a window 390px wide,
  then the contexts it gives have no `showItem`.
