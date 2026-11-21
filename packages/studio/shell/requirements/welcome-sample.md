# shell.welcome-sample

- Status: active
- Since: unreleased
- Source: flow-first-run 2.1 and 2.2, first-run-flow 3.1, 8a and 10.2 R11, ux-checklists-t14-t15 part 2, microcopy 3.2 and 5; HAL-1308, HAL-13429, HAL-13571

When the app gives the welcome screen the demo, it shall also show **Open demo**. While Recent is empty, **Open demo** shall be the primary button, with **Open folder** as a secondary button beside it, the line "New here? The demo takes about 4 minutes." right under them as its description, and **New workspace…** as a quiet link under that line, and focus shall start on **Open demo**. Once Recent has entries, **Open folder** shall be the primary button and **Open demo** one quiet link under the Recent list, without the time line. When the user presses it, the shell shall call the app's demo creator, and while it runs the button shall read "Copying the demo…" and be busy: it keeps focus and ignores presses, while **Open folder** and **New workspace…** stay usable. If the demo can't be copied, then the welcome screen shall say "Can't copy the demo to *folder*: *reason*." under its text in the danger colour, with the button working again. A Recent row of a workspace that was created as the sample shall end in an outline **Demo** tag, and its name for a screen reader shall end in ", Demo". On a phone the tag shall sit on the name's line, right after the name, so the folder keeps the row's width. Without the sample creator there is no such button.

## Examples

- Given Recent is empty, then the screen shows **Open demo** and **Open folder** in one row, the time line under them and **New workspace…** under the time line, and focus is on **Open demo**.
- Given Recent has one workspace, then **Open demo** is a link under the list, the time line is gone and focus starts on **Open folder**.
- Given the demo is being copied, then the button reads "Copying the demo…" and a second press does nothing.
- Given the folder can't be written, then the screen says "Can't copy the demo to Documents: permission denied." and the button works again.
- Given a Recent row is a sample, then it ends in a Demo tag and reads "Acme, ~/Documents/Acme sample, Demo".
- Given a Recent row is a sample on a phone, then its Demo tag follows its name on the name's line, and it reads the same.
