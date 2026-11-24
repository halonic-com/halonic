# studio.focused-app-window

- Status: active
- Since: unreleased
- Source: HAL-17915; the windows in `studio.src-tauri.focused-apps`; what they show in `shell.focused-apps`

When the desktop app's page loads in a window the shell labelled `inbox` or `messenger`, it shall show only that focused app (Halonic Inbox or Halonic Messenger), as its feature added it, and not Studio's window: no Welcome, title bar tabs, places or status bar. It shall open the workspace Studio last had open, the first in Recent, as a Recent row opens it. With no workspace in Recent, or one it can't open, the window shall say "Open Halonic to choose a workspace." and the console shall say why it couldn't open. Studio's own window, and a label no feature added as a focused app, shall still show Studio.

## Examples

- Given Acme first in Recent,
  when the page loads in the window labelled `inbox`,
  then it shows the Inbox for Acme on the focused frame, and no tabs or places.
- Given Acme first in Recent,
  when the page loads in the window labelled `messenger`,
  then it shows the Messenger's chats list, and no tabs or places.
- Given nothing in Recent,
  when the page loads in the window labelled `inbox`,
  then it says "Open Halonic to choose a workspace."
