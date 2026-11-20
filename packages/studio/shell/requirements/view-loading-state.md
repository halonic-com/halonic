# shell.view-loading-state

- Status: active
- Since: unreleased
- Source: HAL-11640 (states audit gap 2, HAL-11635); microcopy 1.1 (Loading) and 22 F14

While the code of a place's page, an item's page, an item page section, a sidebar view or a Settings section loads, the shell shall show nothing for 300 ms, then still skeleton rows hidden from screen readers, and a status line that says "Loading _page_", where _page_ is the page's, the sidebar view's or the Settings section's name; an item page section names nothing, since its page already shows. After 10 seconds the status line shall say "Still loading", and "Still loading" and **Try again** shall show under the rows. **Try again** shall import the view again, keep the rows, move focus to the loading area and start the 10 seconds over. A feature's dialogs and status bar items, which have no area of their own, shall still show nothing while they load. When a view's code fails to load, the shell shall forget that import, so **Reload page** on "This page stopped working" imports the view again and shows the page when it loads.

## Examples

- Given the Agents page's code takes 2 seconds to load,
  when the tab opens Agents,
  then the page area shows nothing for 300 ms, then skeleton rows and the status "Loading Agents", then the page.
- Given the Agents page's code is still loading after 10 seconds,
  then the status says "Still loading" and Try again shows under the rows.
- Given the Agents page's code failed to load once and would load now,
  when the user presses Reload page,
  then the Agents page shows.
