# Decision: Welcome leads with Open demo, and the demo opens on Support reply

- Approval: the board approved the first-run flow on 19 Nov (HAL-7993; first-run-flow revision 7, sections 3.1 and 3.2 on HAL-7985). Liam approves this note on HAL-13429
- Kind: user-visible

While Recent is empty, Welcome's primary button is **Open demo**, with **Open folder** beside it as a secondary button
and **New workspace…** as a quiet link under them. Focus starts on **Open demo**, and "New here? The demo takes about 4
minutes." sits under the buttons as its description, in place of the cost line. Once Recent has entries, **Open
folder** leads again and **Open demo** stays the quiet link under the list, as the sample link was.

A demo that opens through **Open demo** or **Fresh copy of the demo** shows the workflow Support reply, with the
Workflows list one Back step behind it. The Workflows list has no selected row of its own, so the workflow's page is
what "Support reply selected" shows. The guide card beside it comes with build 5 (HAL-13433). A workspace opened any
other way still opens on Home.

The requirement edits only say what the approved design says. The test edits change expected words and add cases;
none is removed or weakened.

## Covers

- shell.welcome-sample
- workspace.try-sample
