# shell.welcome-recent

- Status: active
- Since: unreleased
- Source: flow-workspace 2.1, microcopy 3.2 and 19.6, req-workspace `workspace.switcher.recent-workspaces` (HAL-110); states-flow-map W2 and W7 (HAL-5878); HAL-1291

When the app gives the welcome screen the workspaces remembered on this device, the welcome screen shall show, under **Open folder**, the heading "Recent" and up to five of them, most recent first, each a button with the workspace's name over its folder, named "*name*, *folder*". With nothing remembered, the heading shall be hidden and no sentence shall stand in its place. When the user presses a row, the shell shall open that workspace, and while it opens the row shall be busy: it keeps focus and ignores presses, as do the other rows and **Open folder**. If a row's folder fails to open, then the welcome screen shall say why on the same line as for **Open folder**; if the folder is gone, then the line shall offer **Remove from Recent**, the row shall stay until the user removes it, and after removing it, focus shall go to the next row, else to **Open folder**. The row that failed shall have the danger outline, be described by that line and be scrolled into view. A folder too long for its row shall be cut in the middle, at a "/" or "\\" when there is one, so its end stays: the end shall start at the first "/" or "\\" in its last 24 characters, or, when the last name alone is longer, at the one before it; when that end is itself wider than the row, it shall wrap onto more lines, between folder names first, and no part of the row shall draw past its edge. The cut start shall keep at least 2em, its first letter and a whole "…", and a folder that isn't cut shall have no start. A name too long for one line shall wrap and show in full, not be cut. The welcome screen shall hang a fixed 18% of the window height from the top, so no line that appears moves what is above it.

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
- Given a window 320px wide, as at 400% zoom, and a row whose folder is `/work/projects/customer-support-automation-for-the-benelux-region`,
  then the row shows "/…" and the folder's last name over two lines, all inside the row.
- Given a row whose folder is `D:\Sam Jansen\OneDrive - Acme BV\Documents\Acme sample`, <!-- leak-guard: allow absolute-path made-up example path -->
  then its end reads `\Documents\Acme sample`, after the cut start and its "…".
- Given a row whose folder is cut and whose end is wider than the row,
  then the start still shows its first letter and a whole "…", never a letter and "..".
