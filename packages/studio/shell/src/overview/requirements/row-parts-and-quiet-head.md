# shell.overview.row-parts-and-quiet-head

- Status: draft
- Since: 0.1.0
- Source: HAL-9747 (T7 PR 2); flow-workflows 2.1; G5 decisions 39 and 41

Where a feature gives an item an avatar or chips, the overview page shall draw the avatar before the name and the chips after it, and where the feature asks for a quiet head, the page shall hide the search field, the create button and the hub chips while nothing is listed, so the empty state holds the only button.

## Examples

- Given the item "Invoice intake" with the avatar "I" and the chip "1 running",
  when the page shows,
  then its row shows the avatar, the name and the chip.
- Given a quiet head and no items in any hub,
  when the page shows,
  then it shows only the feature's "nothing yet" state, with the button the feature gave it, and no search field, **New** button or chips.
- Given a quiet head and one workflow,
  when the page shows,
  then the search field and the create button show.
