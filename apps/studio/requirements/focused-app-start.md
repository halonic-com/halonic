# studio.focused-app-start

- Status: active
- Since: unreleased
- Source: HAL-20489 (Preview .438: Halonic Messenger and Halonic Inbox stayed on the page's "Starting Halonic…" text); the window in `studio.focused-app-window`, its wait in `shell.focused-app-opening`

When the desktop app's page starts in a focused app's window, it shall draw the window at once, saying that it opens its workspace (`shell.focused-app-opening`), before it waits on the shell for anything, so the page's own "Starting Halonic…" text never stays. When opening the workspace fails in any step, the window shall say "Open Halonic to choose a workspace." and the console shall say why. When the workspace hasn't opened within 60 seconds, the window shall keep saying that it opens it, the console shall name the step it still waits on (reading the window's content, reopening the folder, or opening the workspace), and the window shall show the workspace once it opens.

## Examples

- Given Acme first in Recent and a shell that never answers `window_content_get`,
  when the page starts in the window labelled `messenger`,
  then the page's "Starting Halonic…" text is gone and the window says "Reading the workspace…".
- Given the same shell,
  when 60 seconds have passed,
  then the window still says "Reading the workspace…", with an "Open Halonic" button, and the console says it is still reading the window's content.
- Given Acme first in Recent and a shell that refuses `reopen_folder`,
  when the page starts in the window labelled `inbox`,
  then the window says "Open Halonic to choose a workspace." and the console says it couldn't open the workspace at Acme's folder.
- Given the Messenger's window still reading the workspace after the minute,
  when Acme opens then,
  then the window shows the Messenger for Acme.
