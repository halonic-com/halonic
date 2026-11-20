# Decision: Welcome leads with Open demo, the demo opens on Support reply, and the Recent tag reads Demo

- Approval: the board approved the first-run flow on 19 Nov (HAL-7993; first-run-flow revision 7, sections 3.1 and 3.2 on HAL-7985). The time line's place and the Demo tag are the team's decision in the screen check of first-run build 1 (HAL-13571), recorded in first-run-flow revision 9, sections 3.1 and 10.2 R11 on HAL-7985, and built on HAL-13575. Liam approves this note on HAL-13429
- Kind: user-visible

While Recent is empty, Welcome's primary button is **Open demo**, with **Open folder** beside it as a secondary button.
"New here? The demo takes about 4 minutes." sits right under them as Open demo's description, in place of the cost
line, and **New workspace…** is a quiet link after it. The line describes **Open demo**, so it belongs under it; with
**New workspace…** just above "New here?", the two "New" lines would read as one. Focus starts on **Open demo**. Once
Recent has entries, **Open folder** leads again and **Open demo** stays the quiet link under the list, as the sample
link was.

A demo that opens through **Open demo** or **Fresh copy of the demo** shows the workflow Support reply, with the
Workflows list one Back step behind it. The Workflows list has no selected row of its own, so the workflow's page is
what "Support reply selected" shows. The guide card beside it comes with build 5 (HAL-13433). A workspace opened any
other way still opens on Home.

The outline tag on the demo's row reads **Demo** instead of **Sample**: on Welcome's Recent (its screen-reader name
now ends in ", Demo"), in the workspace menu's Recent and in the phone's workspace sheet. The board made **Sample
answers** the one name for the test-model path, and the tag stays on the folder after the user picks a real model,
where "Sample" would be wrong. The folder name `Acme sample` stays (10.2 R2).

The requirement edits only say what the design says. The test edits change expected words and add cases, including a
check of the order; none is removed or weakened.

## Covers

- shell.welcome-sample
- workspace.try-sample
- workspace.menu-sample-tag
- workspace.served-picker
- kit.menu-tag
- kit.header-badge-sheet-rows
