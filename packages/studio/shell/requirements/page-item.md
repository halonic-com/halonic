# shell.page-item

- Status: draft
- Since: unreleased
- Source: HAL-20756

When the view of a place in a desktop tab calls its context's `setPageItem` with an item, such as the run the Runs page has open in its content pane, the window shall give that item as `activeItem` while that tab is active and still shows that place, and shall tell `activeItem`'s listeners. The window shall keep that item for the tab and the place that set it, outside the tab's history, and shall drop it once the tab shows another place or closes, or the page calls `setPageItem(null)`, which a page does whenever it is drawn with no item in view. The window shall give `setPageItem` only to the view of a place drawn in a desktop tab; `shown` shall still name the place.

## Examples

- Given a tab on Runs, active,
  when its page calls `setPageItem({ kind: "run", hub: "acme", id: "r1" })`,
  then `activeItem.get()` is that run and a listener ran once.
- Given that, when the tab opens Agents,
  then `activeItem.get()` is `null`, and Back to Runs alone does not bring the run back.
- Given that, when the user switches to a tab on Home,
  then `activeItem.get()` is `null`; switching back gives the run again.
- Given that, when the run closes and the page calls `setPageItem(null)`,
  then `activeItem.get()` is `null` and a listener ran again.
- Given that, when the Runs tab closes,
  then the window keeps no item for it.
