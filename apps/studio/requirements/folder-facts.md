# studio.folder-facts

- Status: active
- Since: unreleased
- Source: HAL-20676 (P3 of the HAL-20617 build plan); HAL-20673 rail flows, lines 6 and 7, revision 2; review of #6873

The app shall give each open folder's window the facts the icon rail's rules read, from the folder's own services: its git state from the Changes list, whether runs are recorded from the Runs list, and how many of the Inbox's own items wait from the Inbox. When the Changes list, the Runs list or the Inbox changes, as when history is turned on or a run starts, the app shall read the facts again and tell the rail only when one of them changed. When the rail starts listening, the app shall read the facts again, so a change before then shows at once. While the Changes list has no answer from the history, the app shall keep the last git state, starting from a repository. Where a service is missing, as the Inbox can be, the app shall count none for it. While Studio opens only workspace projects, the app shall give the kind as a workspace project with items and no code folder inside. The app shall count the agents' cards among what waits only once HAL-20787 does it.

## Examples

- Given the Changes list's answer is "not a repository",
  when the rail reads the facts,
  then the git state is `not-a-repository`.
- Given a run starts in a folder with none,
  when the Runs list changes,
  then the facts say runs are recorded and the rail is told once.
- Given a folder that isn't a repository,
  when the person turns on history,
  then the git state becomes `repository` without the window coming to the front.
