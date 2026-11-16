# shell.engine-failed-window

- Status: active
- Since: 0.1.0
- Source: HAL-1845 (PR 1); microcopy 22 F1, F1b and F18; UX checklist part 1, 1.1 (HAL-1847)

When the engine reports that it didn't start, the shell shall show a full window in place of Welcome or Home, with the title "Halonic's engine didn't start", the reason for the engine's failure (`stopped-while-starting`: "It stopped while starting.", `no-answer`: "It didn't answer within 30 seconds.", `data-folder-not-writable`: "Halonic can't write to its data folder."), the line "Your workspaces are folders of plain files, and nothing in them changed.", the button **Try again** and the link **Copy details**. The window shall have no sidebar, tabs or status bar items. When it shows, the shell shall move focus to its title and announce "Halonic's engine didn't start. _reason_" once, assertively. **Try again** shall start the engine again and show the button busy, with its label, until the engine answers or fails again; when the engine answers, the window shall draw nothing. **Copy details** shall put the failure's reason, its exit code and the engine's log lines on the clipboard; the log lines shall never show on the window. On the first start after an update, the window shall add "Halonic was just updated to _new_. If this keeps happening, uninstall Halonic, then install _old_ again from the release page. Your workspaces and settings stay." and the link **Open release page**, which opens the old version's release page in the browser.

## Examples

- Given the engine didn't answer within 30 s,
  when the window shows,
  then it reads "It didn't answer within 30 seconds." and "Your workspaces are folders of plain files, and nothing in them changed.", focus is on the title, and the assertive region reads "Halonic's engine didn't start. It didn't answer within 30 seconds."
- Given the engine stopped with exit code 137 and logged "disk quota exceeded",
  when the user presses Copy details,
  then the clipboard holds the reason, "Exit code: 137" and "disk quota exceeded", and the window shows none of them.
- Given the window shows,
  when the user presses Try again,
  then the button is busy and keeps its label, and when the engine answers the window draws nothing.
- Given the first start after an update from 0.1.0 to 0.1.1 failed,
  when the window shows,
  then it also says "Halonic was just updated to 0.1.1. …install 0.1.0 again from the release page…" with **Open release page**; a start that isn't the first after the update shows the plain window.
