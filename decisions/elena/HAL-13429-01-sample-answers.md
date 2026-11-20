# Decision: "Open demo" and "Sample answers" replace "Try the Acme sample", and the chip follows the model

- Approval: the board approved the first-run flow on 19 Nov (HAL-7993; first-run-flow revision 7, section 8a and the team decisions in 10.2 on HAL-7985). Liam decided on HAL-13429 to keep the one-click copy without a folder dialog (10.2 R2), and approves this note there
- Kind: user-visible

The board chose one name for the scripted path, **Sample answers**. On Welcome, **Open demo** takes the place of
**Try the Acme sample**. This pull request changes the words; the next one in the stack changes Welcome's order. The
busy and failure words follow the new name: "Copying the demo…" and "Can't copy the demo to *folder*: *reason*."
The copy itself is unchanged: by Liam's decision it stays the one-click copy into `Documents/Acme sample`, so the
folder names, reopening a remembered copy and the "Created…" toasts stay as built.

The header chip "Sample · test model" is renamed **Sample answers**, and its menu row **Fresh copy of the
demo**. The chip now also needs the demo's `default` model to be the test model (10.2 R3). Once `default` names a real
model the chip goes, because the answers are no longer scripted. The app reads this from `models.yaml` and the
provider file it names, again on every change. The kit's header-badge requirements only change their example words.

The requirement edits only say what the approved design says. The test edits change expected words and add cases;
none is removed or weakened.

## Covers

- shell.welcome-sample
- shell.welcome-cant-open
- workspace.try-sample
- workspace.narrow-window
- workspace.narrow-window-sheet-focus
- studio.try-sample
- kit.header-badge
- kit.header-badge-sheet
