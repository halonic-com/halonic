# files.rail-entry

- Status: active
- Since: unreleased
- Source: HAL-20676 (P3 of the HAL-20617 build plan); HAL-20673 rail flows, line 12, revision 2

The Code entry shall show in the icon rail while the open folder is a code folder, or a workspace project that has a code folder inside. The feature shall add the entry through the shell's `rail.add`, with its own name, icon and order (10), so the shell holds no list of them (`shell.rail-entries`).

## Examples

- Given a code folder,
  when the rail's entries are listed,
  then Code shows.
- Given a workspace project with a code folder inside,
  when the rail's entries are listed,
  then Code shows.
- Given a workspace project without one,
  when the rail's entries are listed,
  then Code is left out.
