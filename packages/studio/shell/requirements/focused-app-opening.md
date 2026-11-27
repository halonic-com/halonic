# shell.focused-app-opening

- Status: active
- Since: unreleased
- Source: HAL-20489 (Preview .438: Halonic Messenger and Halonic Inbox stayed on "Starting Halonic…"); the wording is the Recent row's step from HAL-19599; the start in `studio.focused-app-start`

While a focused app's window is still opening its workspace, the window shall show its frame and panel with the waiting line "Reading the workspace…", with the time waited from 2 seconds, and not "Open Halonic to choose a workspace.". Once the workspace has opened, the window shall show the app's view for it; once the open has ended without a workspace, it shall say "Open Halonic to choose a workspace." as before.

## Examples

- Given a focused app's window opening its workspace for 3 seconds,
  when it is drawn,
  then it shows "Reading the workspace…" and 3 s, and no "Open Halonic" button.
- Given the same window,
  when its workspace has opened,
  then it shows the app's view and no waiting line.
