# studio.folder-facts

- Status: active
- Since: unreleased
- Source: HAL-20676 (P3 of the HAL-20617 build plan); HAL-20673 rail flows, lines 6 and 7, revision 2

The app shall give each open folder's window the facts the icon rail's rules read, from the folder's own services: its git state from its history, whether runs are recorded from the Runs list, and how many Inbox items wait from the Inbox. When the history, the Runs list or the Inbox says it may have changed, the app shall read the facts again and tell the rail only when one of them changed. If the history can't be read, then the app shall keep the last git state and report the error. Where a service is missing, as the Inbox can be, the app shall count none for it. While Studio opens only workspace projects, the app shall give the kind as a workspace project with items and no code folder inside.

## Examples

- Given the folder's history answers "not a repository",
  when the rail reads the facts,
  then the git state is `not-a-repository`.
- Given a run starts in a folder with none,
  when the Runs list changes,
  then the facts say runs are recorded and the rail is told once.
- Given the history can't be read,
  when the window comes to the front,
  then the git state stays as it was and the error is reported.
