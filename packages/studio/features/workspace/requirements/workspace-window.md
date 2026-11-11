# workspace.workspace-window

- Status: active
- Since: 0.1.0
- Source: req-workspace `workspace.switcher.close-keeps-a-slot` and `.ctrl-number-keys` (HAL-110), flow-workspace 2.1 and 2.2, state-coverage "No place yet" (HAL-2160, HAL-5156); HAL-1291

While no workspace is open, the desktop app's window shall show the shell's Welcome screen, with no sidebar and no workspace switcher. While a workspace is shown, the window shall show its Studio window with the workspace switcher at the top of the sidebar, named "Workspace: *name*", with its folder under its name. When the last workspace closes, the window shall show the Welcome screen again. When the user presses Ctrl 1 to Ctrl 9 (⌘1 to ⌘9 on macOS) without Alt or Shift, the window shall show the open workspace at that position and do nothing if there is none.

## Examples

- Given the desktop app has just started,
  then the window shows "Halonic Studio" and **Open folder**, and no switcher.
- Given the user opened `/work/acme`,
  then the sidebar's switcher reads "acme" over "/work/acme".
- Given "acme" and "beta" are open and "beta" is shown,
  when the user presses Ctrl 1,
  then "acme" is shown; Ctrl Alt 2 changes nothing.
