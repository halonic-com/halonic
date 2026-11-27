# studio.focused-app-start

- Status: active
- Since: unreleased
- Source: HAL-20489 (Preview .438: Halonic Messenger and Halonic Inbox stayed on the page's "Starting Halonic…" text); the window in `studio.focused-app-window`, its wait in `shell.focused-app-opening`

When the desktop app's page starts in a focused app's window, it shall draw the window at once, saying that it opens its workspace (`shell.focused-app-opening`), before it asks the shell anything, so the page's own "Starting Halonic…" text never stays. When opening the workspace fails in any step, the window shall say "Open Halonic to choose a workspace." and the console shall say why. When the workspace hasn't opened within 60 seconds, the window shall say the same, the console shall say it is still opening, and the window shall show the workspace if it opens later.

## Examples

- Given Acme first in Recent and a shell that never answers `window_content_get`,
  when the page starts in the window labelled `messenger`,
  then the page's "Starting Halonic…" text is gone and the window says "Reading the workspace…".
- Given the same shell,
  when 60 seconds have passed,
  then the window says "Open Halonic to choose a workspace."
- Given the Messenger's window saying "Open Halonic to choose a workspace." after the minute,
  when Acme opens then,
  then the window shows the Messenger for Acme.
