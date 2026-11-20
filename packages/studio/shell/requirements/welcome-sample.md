# shell.welcome-sample

- Status: active
- Since: unreleased
- Source: flow-first-run 2.1 and 2.2, first-run-flow 8a, ux-checklists-t14-t15 part 2, microcopy 3.2 and 5; HAL-1308, HAL-13429

When the app gives the welcome screen the demo, it shall also show **Open demo**, a secondary button under **New workspace…**. While Recent is empty, the cost line "Runs on the built-in test model, with scripted replies. No key, no cost." shall sit under it. Once Recent has entries, it shall be one quiet link under the Recent list, without the cost line. When the user presses it, the shell shall call the app's demo creator, and while it runs the button shall read "Copying the demo…" and be busy: it keeps focus and ignores presses, while **Open folder** and **New workspace…** stay usable. If the demo can't be copied, then the welcome screen shall say "Can't copy the demo to *folder*: *reason*." under its text in the danger colour, with the button working again. A Recent row of a workspace that was created as the sample shall end in an outline **Sample** tag, and its name for a screen reader shall end in ", Sample". Without the sample creator there is no such button.

## Examples

- Given Recent is empty, then the screen shows **Open demo** with the cost line under it.
- Given Recent has one workspace, then the link is under the list and the cost line is gone.
- Given the demo is being copied, then the button reads "Copying the demo…" and a second press does nothing.
- Given the folder can't be written, then the screen says "Can't copy the demo to Documents: permission denied." and the button works again.
- Given a Recent row is a sample, then it ends in a Sample tag and reads "Acme, ~/Documents/Acme sample, Sample".
