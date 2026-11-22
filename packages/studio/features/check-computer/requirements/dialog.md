# check-computer.dialog

- Status: active
- Since: unreleased
- Source: HAL-13411; first-run-progress 4.1 to 4.5 and 5 on HAL-7986 (approved by the board on 19 Nov, HAL-7993); `check-computer.lines`; `check-computer.report`; `shell.help-menu`

When the command `check-computer.open` runs, or the person picks **Help › Check this computer**, and the app gives the open folder its check source, the feature shall open the dialog **Check this computer**, with focus on its title, the line "Includes everything `halonic doctor` checks in a terminal. It changes nothing and sends nothing." and the source's checks running at once: a status region shall say "Checking this computer" while they run, and each line shall show as its check answers, in the order Engine, Workspace, Models, Default model, Last run, Sandbox, Harnesses, Network, Disk, Google, as `check-computer.lines` words it, with its buttons. When every check has answered, the status region shall show the heading as chips, "1 problem" (danger), "1 warning" (attention) or "No problems found" (success). The Not checked line shall be a quiet sentence under the list. When no line is a problem, the dialog shall add "If something still doesn't work, copy the report and send it with your question. It has no keys, no file contents and no run data." **Check again**, busy while the checks run, shall drop the lines and run every check again; **Show the report** (**Hide the report** while open) shall unfold exactly what **Copy report** copies (`check-computer.report`), with "This is all the report holds. No keys, no file contents, no run data. Folder paths show as ~." under it, and "Step and agent names stay on screen; the report counts steps instead." when it has a Last run. **Review** shall run `workspace.open-trust`, **Open Models** and **Pick another model** `workspace.open-models`, and **Open the run** shall open the run, each after closing the dialog; a button the window has no way to follow shall not show. **Close** and Escape shall close the dialog, and closing it, or Check again, shall abort the check that runs, so nothing runs on. Without the app's check source, as in the browser demo, the Help group shall have no item and the command shall show nothing. The dialog shall change nothing and send nothing.

## Examples

- Given a source that has answered Engine and Models (Ollama not answering) and still runs,
  when the dialog opens,
  then the status says "Checking this computer" and both lines show; when the check ends, the status shows "1 problem".
- Given the dialog open with a Workspace that isn't trusted yet,
  when the person presses Review,
  then the dialog closes and `workspace.open-trust` runs.
- Given the dialog open while the check runs,
  when the person closes it,
  then the check's signal is aborted.
- Given a check that has ended,
  when the person presses Check again,
  then the lines are dropped and a second check runs.
- Given every line passed,
  then the heading reads "No problems found" with the sentence under the lines, and Copy report copies the report.
- Given no check source,
  then the Help menu's Check this computer group has no item.
