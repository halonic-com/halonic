# library.rail-entry

- Status: active
- Since: unreleased
- Source: HAL-20676 (P3 of the HAL-20617 build plan); HAL-20673 rail flows, line 13, revision 2

The Library entry shall show in the icon rail while the open folder has items. The feature shall add the entry through the shell's `rail.add`, with its own name, icon and order (20), so the shell holds no list of them (`shell.rail-entries`).

## Examples

- Given a workspace project,
  when the rail's entries are listed,
  then Library shows.
- Given a code folder without items,
  when the rail's entries are listed,
  then Library is left out.
- Given a code folder with items,
  when the rail's entries are listed,
  then Library shows.
