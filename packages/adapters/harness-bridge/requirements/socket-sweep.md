# harness-bridge.socket-sweep

- Status: active
- Since: 0.1.0
- Source: HAL-7302 (a crashed host leaves its run folders behind), from the review of HAL-6316 on HAL-7227

When asked to sweep a socket folder, the Node bridge shall remove each run folder in it that a bridge left behind: a real folder owned by this user with mode 0700 that holds only a socket named `bridge.sock` that refuses a connection, or that is empty and at least a minute old. It shall leave every other entry where it is, a live bridge's run folder included, and change nothing when the socket folder is missing. It shall refuse, and remove nothing, when the socket folder isn't a real folder of this user's that nobody else can write to.

## Examples

- Given a run folder whose socket nothing listens on any more,
  when the socket folder is swept,
  then the run folder is gone.
- Given an open socket bridge in the same socket folder,
  when it is swept,
  then the bridge's run folder stays and the bridge still serves.
- Given an empty run folder two minutes old and another made a moment ago,
  when the socket folder is swept,
  then the old one is gone and the new one stays.
- Given a link, a folder with mode 0755, a folder holding another file, and a plain file named `bridge.sock` in a run folder,
  when the socket folder is swept,
  then all of them stay.
- Given no socket folder,
  when it is swept,
  then nothing is removed and no folder is created.
- Given a socket folder that others can write to,
  when it is swept,
  then the sweep fails, says it isn't private, and removes nothing.
