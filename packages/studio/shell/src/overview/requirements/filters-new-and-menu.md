# shell.overview.filters-new-and-menu

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (T10, P1b, HAL-8988); UX checklist section 0

The overview page shall show a row of hub filter chips ("All", one per hub, and the shared one when something is shared) that limits the sections shown, the feature's one create button after the search field, and, on each row the feature gives a menu for, a ⋮ button named for the row that opens the feature's menu items. It shall fall back to "All" when the chosen hub is gone, and use only the words the feature passes in.

## Examples

- Given hubs "acme" and "beta",
  when the user picks the "beta" chip,
  then only the "beta" section shows.
- Given the feature passes a "New skill" button,
  when the user presses it,
  then the feature's create handler is called.
- Given a menu for the item "Summarise",
  when the user presses "More actions for Summarise",
  then the menu opens with the feature's items, and picking one calls its handler.
