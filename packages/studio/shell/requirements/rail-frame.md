# shell.rail-frame

- Status: active
- Since: unreleased
- Source: HAL-20676 (P3 of the HAL-20617 build plan); HAL-20673 rail flows, lines 1 to 7 and 2a, revision 2

The Studio window shall show the icon rail on the desktop at the window's left edge, before the sidebar, with the entries the open folder's facts show. Where the app gives no folder facts, the window shall show the entries of a workspace project with items. When the folder facts change, the window shall show the entries the new facts show. While the active tab is in an entry whose rule no longer holds, the window shall keep showing that entry. When the person clicks a rail entry, the rail shall mark that entry selected until the active tab moves into another entry. The sidebar beside the rail shall leave out the places another entry holds, shown or hidden, so it lists the selected entry's places and the places no entry holds. While no entry is selected, the sidebar shall list every place.

## Examples

- Given Library holds Agents and Inbox holds the Inbox,
  when the active tab shows Agents,
  then the sidebar lists Agents and not the Inbox.
- Given Messenger holds Team and has no page yet,
  when the person clicks Messenger while the active tab shows Home,
  then the tab still shows Home, Messenger is selected and the sidebar lists Team.
- Given the person clicked Messenger,
  when the active tab moves to the Inbox,
  then Inbox is selected.
- Given Runs shows only while runs are recorded,
  when the folder facts change to say a run is recorded,
  then the rail shows Runs.
- Given the active tab shows the Search page,
  when the sidebar is shown,
  then it lists every place.
