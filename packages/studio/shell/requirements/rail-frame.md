# shell.rail-frame

- Status: active
- Since: unreleased
- Source: HAL-20676 (P3 of the HAL-20617 build plan); HAL-20673 rail flows, lines 1 to 7 and 2a, revision 2

The Studio window shall show the icon rail on the desktop at the window's left edge, before the sidebar, with the entries the open folder's facts show. Where the app gives no folder facts, the window shall show the entries of a workspace project with items. When the folder facts change, the window shall show the entries the new facts show. While the active tab is in an entry whose rule no longer holds, the window shall keep showing that entry. When the person clicks a rail entry, the rail shall mark that entry selected until the active tab moves into another entry. The window's rail shall name the places the list column beside it leaves out: those another entry holds, shown or hidden, so the column keeps the selected entry's places and the places no entry holds. While no entry is selected, the rail shall name no place to leave out. The sidebar beside the rail shall list only the places the rail doesn't leave out, and shall keep listening to the signals of those it leaves out.

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
