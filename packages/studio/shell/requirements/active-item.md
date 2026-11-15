# shell.active-item

- Status: active
- Since: 0.1.0
- Source: HAL-1292 (T4), HAL-10289

The window shall give every feature's context a read-only `activeItem`: the item the active window tab shows, as its `ItemRef`, or `null` when that tab shows Home, a place or a search, or when no tab is active. It shall let a feature subscribe, shall tell a listener only when the item itself changes, and shall expose nothing else of the tabs. On a phone, which has no tabs, `activeItem` is absent.

## Examples

- Given tabs on Home and on the run `acme/r1`, Home active,
  when the user switches to the run's tab,
  then `activeItem.get()` is `{ kind: "run", hub: "acme", id: "r1" }` and a listener ran once.
- Given the run's tab is active,
  when it closes and the tab to its right shows a place,
  then `activeItem.get()` is `null` and a listener ran.
- Given only Home is open,
  when a feature reads `activeItem.get()`,
  then it is `null`, and a tab switch between two tabs on Home does not run a listener.
