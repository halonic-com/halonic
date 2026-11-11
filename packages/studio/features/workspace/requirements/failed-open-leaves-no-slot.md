# workspace.failed-open-leaves-no-slot

- Status: active
- Since: 0.1.0
- Source: req-workspace `workspace.switcher.failed-open-leaves-no-slot` (HAL-110), flow-workspace 2.2, microcopy 1.3 and 3.2; states-flow-map E1 to E5 and D1 (HAL-5878); HAL-1291

If the folder picker is cancelled, then the workspace switcher shall change nothing and say nothing. If a folder fails to open, then the switcher shall add no slot for it and not remember it, and shall say "Can't open *folder*: *reason*": under the Welcome screen's text when no workspace is shown, else in a danger toast over the workspace that is shown, which stays until closed. The reason follows `shell.welcome-cant-open`. When the folder of a Recent row is gone, the toast's action shall be **Remove from Recent**, which forgets that row; when the reason can't be explained, the action shall be **Copy details**.

## Examples

- Given "acme" is shown,
  when the user picks **Open a folder…** and cancels the picker,
  then only "acme" is open and no message shows.
- Given "acme" is shown,
  when opening the Recent row `/work/old` fails because the folder isn't there,
  then only "acme" is open, the danger toast reads "Can't open /work/old: the folder is gone." and its **Remove from Recent** forgets the row.
