# shell.rail-frame

- Status: active
- Since: unreleased
- Source: HAL-20676 (P3 of the HAL-20617 build plan); HAL-20673 rail flows, lines 1 to 7 and 2a, revision 2; one list column per place, HAL-21050 (plan approved on HAL-21051)

The Studio window shall show the icon rail on the desktop at the window's left edge, before the sidebar, with the entries the open folder's facts show. Where the app gives no folder facts, the window shall show the entries of a workspace project with items. When the folder facts change, the window shall show the entries the new facts show. While the active tab is in an entry whose rule no longer holds, the window shall keep showing that entry. When the person clicks a rail entry, the rail shall mark that entry selected until the active tab moves into another entry. The window's rail shall name the places the list column beside it leaves out: those another entry holds, shown or hidden, so the column keeps the selected entry's places and the places no entry holds. While no entry is selected, the rail shall name no place to leave out. The sidebar beside the rail shall list only the places the rail doesn't leave out, and shall keep listening to the signals of those it leaves out. While the active tab shows a place that has its own list column and the desktop window is at least 900px wide, the list column shall show that place's list in place of the places, and the place's page shall leave the list out. While the window is narrower than 900px, the Places drawer shall keep the places, and the place's page shall draw its own list. The window shall keep one open item for each tab's place, which the list column and the page share, so that a row picked in the list column opens in the page and the open item stays when the window crosses 900px. When a tab closes, the window shall drop that tab's open items.

## Examples

- Given Library holds Agents and Inbox holds the Inbox,
  when the active tab shows Agents,
  then the column keeps Agents and leaves out the Inbox.
- Given Messenger holds Team and has no page yet,
  when the person clicks Messenger while the active tab shows Home,
  then the tab still shows Home, Messenger is selected and the column keeps Team.
- Given the person clicked Messenger,
  when the active tab moves to the Inbox,
  then Inbox is selected.
- Given Runs shows only while runs are recorded,
  when the folder facts change to say a run is recorded,
  then the rail shows Runs.
- Given the Inbox's place is left out,
  when its waiting count changes,
  then the sidebar still hears it, so the Inbox shows its count as soon as it is listed again.
- Given the active tab shows the Search page,
  when the rail is shown,
  then the column keeps every place.
- Given the active tab shows Changes, which has its own list column, in a window 1280px wide,
  when the window is drawn,
  then one list column sits between the rail and the page, at most 380px wide, holding the Changes list, and the page draws no list.
- Given the same tab in a window 800px wide,
  when the person opens the Places drawer,
  then it shows the places, and the page draws the Changes list itself.
- Given the person picked a change in the list column,
  when the window narrows past 900px and widens again,
  then the page still shows that change, and the list marks it.
- Given two tabs on Changes, each with a change open,
  when one tab closes,
  then the other keeps its open change.
