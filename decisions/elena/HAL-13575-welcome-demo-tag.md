# Decision: Welcome's time line sits under Open demo, and the Recent tag reads Demo

- Approval: the team decided this in the screen check of first-run build 1 (HAL-13571), recorded in first-run-flow revision 9, sections 3.1 and 10.2 R11 on HAL-7985. Liam approves this note on HAL-13575
- Kind: user-visible

While Recent is empty, "New here? The demo takes about 4 minutes." now sits right under **Open demo** and **Open
folder**, and **New workspace…** comes after it. The line describes **Open demo**, so it belongs under it; with
**New workspace…** just above "New here?", the two "New" lines read as one. Focus, the busy state and the error line
don't change.

The outline tag on the demo's row reads **Demo** instead of **Sample**: on Welcome's Recent (its screen-reader name
now ends in ", Demo"), in the workspace menu's Recent and in the phone's workspace sheet. The board made **Sample
answers** the one name for the test-model path, and the tag stays on the folder after the user picks a real model,
where "Sample" would be wrong. The folder name `Acme sample` stays (10.2 R2).

The requirement edits only say what the design now says. The test edits change expected words and add a check of the
order; none is removed or weakened.

## Covers

- shell.welcome-sample
- workspace.menu-sample-tag
- workspace.served-picker
- kit.menu-tag
- kit.header-badge-sheet-rows
