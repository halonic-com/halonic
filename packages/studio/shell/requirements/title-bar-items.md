# shell.title-bar-items

- Status: active
- Since: unreleased
- Source: HAL-18216 (S2-25, the account menu); flows B7 ("the same place in every product")

The Studio window shall draw the items features add with `studio.titleBar.add`, in their order: on
the desktop at the right end of the title bar, and on a phone in the top bar at the top of a place,
after **Search** and before the page's own buttons. With no items, or with items whose views draw
nothing, the title bar and the top bar shall look as they did before.

## Examples

- Given a feature adds an "Account menu" button to the title bar,
  when the window is 1280px wide,
  then the button is in the title bar.
- Given the same feature on a phone at the top of Inbox, whose page adds **New rule**,
  when the page shows,
  then the top bar's buttons are **Search**, "Account menu" and **New rule**.
- Given the same phone under a place, with Back,
  when that page shows,
  then the top bar has no "Account menu".
