# runs.rail-entry

- Status: active
- Since: unreleased
- Source: HAL-20676 (P3 of the HAL-20617 build plan); HAL-20673 rail flows, line 16, revision 2

The Runs entry shall show in the icon rail while the open folder has items, or while it has runs recorded, so past runs stay reachable after their items are deleted. The feature shall add the entry through the shell's `rail.add`, with its own name, icon and order (50), so the shell holds no list of them (`shell.rail-entries`).

## Examples

- Given a workspace project,
  when the rail's entries are listed,
  then Runs shows.
- Given a code folder without items,
  when the rail's entries are listed,
  then Runs is left out.
- Given a code folder without items that has runs recorded,
  when the rail's entries are listed,
  then Runs shows.
