# source-control.rail-entry

- Status: active
- Since: unreleased
- Source: HAL-20676 (P3 of the HAL-20617 build plan); HAL-20673 rail flows, line 17, revision 2

The Changes entry shall show in the icon rail for every open folder, whatever its git state, since its page is where history is turned on or explained. The feature shall add the entry through the shell's `rail.add`, with its own name, icon and order (60), so the shell holds no list of them (`shell.rail-entries`).

## Examples

- Given a workspace project,
  when the rail's entries are listed,
  then Changes shows.
- Given a code folder without git,
  when the rail's entries are listed,
  then Changes shows.
- Given a folder on a computer without git,
  when the rail's entries are listed,
  then Changes shows.
