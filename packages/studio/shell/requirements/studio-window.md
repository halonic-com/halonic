# shell.studio-window

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2), plan PR 16; component specs 24.1 to 24.5 (HAL-175); UX checklist part 1, 1.1 to 1.3 and 1.7 (HAL-1323)

The shell shall put the desktop Studio window together from its parts for one open workspace: the window tabs in the title bar, the toolbar with Back, Forward, the path and the save note, the sidebar, the active tab's page with the last five tabs' pages kept mounted, the status bar items features added, and the Ctrl K palette. A new workspace shall start with one tab on Home. The sidebar shall show the Search box, then Home and the places features added, each with its signal read through the context of the feature that added it, then its resize edge. The workspace switcher shall show only once the app gives it a workspace menu.

The page for a tab shall be Home, with the cards features added, when the tab is on Home; the Search page for its words when the tab is on a search; and the view of the place a feature added, given that feature's context, when the tab is on that place. The context the window gives a view shall let it open one of the sidebar's places, as the sidebar does: in the active tab on the desktop, and as the place's list on a phone. The view of a place shall be imported the first time a tab shows it. When a move asks for focus on the new page's `h1` while that page's view is still loading, the shell shall move the focus once the view draws its `h1`, unless the focus moved somewhere else first. The Search box, Mod K, **+** and, in the desktop app, Ctrl T shall open the Ctrl K palette, **+** and Ctrl T over a new tab on Home. When the workspace closes, the window shall stop following its tabs for Ctrl K's Recent.

## Examples

- Given a new workspace,
  when the window shows,
  then it shows the window tabs, the toolbar's path, the places with Home current, and the page "Home".
- Given _inbox_ adds the Inbox with a count of 2 waiting,
  when the sidebar lists the places,
  then they read Home, then Inbox with the count, heard as "Inbox, 2 waiting".
- Given _inbox_ adds the Inbox,
  when the user clicks Inbox in the sidebar,
  then the active tab shows the Inbox's view, with the context of _inbox_.
- Given _inbox_ adds the Inbox, with a view that loads after the click,
  when the user clicks Inbox in the sidebar, or goes Back to it from Home,
  then focus is on the Inbox's `h1` once its view draws.
- Given a tab on the search "refund",
  when it shows,
  then its page is the Search page with "refund" in its box.
- Given the window,
  when the user presses **+**,
  then a second tab opens on Home with the Ctrl K palette over it.
- Given a workspace that was closed,
  when its tabs change after that,
  then Ctrl K's Recent doesn't change.
