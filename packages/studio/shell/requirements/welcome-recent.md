# shell.welcome-recent

- Status: active
- Since: 0.1.0
- Source: flow-workspace 2.1, microcopy 3.2 and 19.6, req-workspace `workspace.switcher.recent-workspaces` (HAL-110); states-flow-map W2 and W7 (HAL-5878); HAL-1291

When the app gives the welcome screen the workspaces remembered on this device, the welcome screen shall show, under **Open folder**, the heading "Recent" and up to five of them, most recent first, each a button with the workspace's name over its folder, named "*name*, *folder*". With nothing remembered, the heading shall be hidden and no sentence shall stand in its place. When the user presses a row, the shell shall open that workspace, and while it opens the row shall be busy: it keeps focus and ignores presses, as do the other rows and **Open folder**. If a row's folder fails to open, then the welcome screen shall say why on the same line as for **Open folder**; if the folder is gone, then the line shall offer **Remove from Recent**, the row shall stay until the user removes it, and after removing it, focus shall go to the next row, else to **Open folder**.

## Examples

- Given seven workspaces are remembered,
  then the welcome screen shows "Recent" and the five most recent, each its name over its folder.
- Given nothing is remembered,
  then the welcome screen shows no "Recent" heading.
- Given the row "old" whose folder `/work/old` is gone,
  when the user presses it,
  then the welcome screen shows "Can't open /work/old: the folder is gone." and **Remove from Recent**, and the row stays.
- Given that message is showing and "beta" is the row under "old",
  when the user presses **Remove from Recent**,
  then the row "old" goes and focus is on "beta".
