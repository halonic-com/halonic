# workspace.workspace-menu

- Status: active
- Since: 0.1.0
- Source: flow-workspace 2.1a, microcopy 4.1 and 4.2 (revision 27, g5-frames T3-F26), req-workspace `workspace.switcher.ctrl-number-keys` (HAL-110); HAL-1291

The workspace menu shall list, top to bottom: the heading "Recent" with the remembered workspaces, each its name over its folder with the shown one checked, a divider, **Open a folder…**, and, while a workspace is shown, a divider and **Close workspace**. With nothing remembered, the heading and its divider shall be hidden. An open workspace's row shall show its key, Ctrl 1 to Ctrl 9 (⌘1 to ⌘9 on macOS), by the order the workspaces were opened. New workspace… and Workspace settings… join the menu with the dialog and the page they open.

## Examples

- Given nothing is remembered and nothing is open,
  then the menu holds only **Open a folder…**.
- Given "Acme" is shown and "Beta" is remembered but not open,
  then the menu reads "Recent", "Acme" (checked, Ctrl 1), "Beta", a divider, **Open a folder…**, a divider and **Close workspace**.
