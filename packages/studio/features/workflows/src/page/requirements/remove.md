# workflows.page.remove

- Status: active
- Since: unreleased
- Source: HAL-12216 (T7b, removing steps and arrows); UX checklist 10.10; flow-workflows 4.6; microcopy 9.3; a11y A2, A4, A13

When the host can remove steps and arrows, the docked step card shall end with **Remove step**, and each row of its arrows shall have a trash button named "Remove arrow <n>". Each shall remove at once, with no confirm, and show a toast "Removed step <id>" (with " and <n> arrow(s)" for the arrows that went with it) or "Removed the arrow from <step> to <target>", with **Undo**; nothing else shall be announced. **Undo** shall put it back through the host, and when the host can't, a danger toast "Couldn't put back step <id>" (or "… the arrow from <step> to <target>") shall say why. After a step is removed its card shall close and focus shall go to the next step's card in the file's order, else to the canvas; after an arrow is removed focus shall go to the next arrow's row, else to **Add**. On the workflow's first step, **Remove step** shall remove nothing and show under it, with the warning mark and as its description, "This is the first step. Pick another first step in Configuration › General before removing it.", which is announced. When the host can't remove, a danger toast "Couldn't change step <id>" shall say why, and the step and its arrows stay.

## Examples

- Given `write` with an arrow to `done` and arrows into it from `sort` and `approve`, when Remove step is pressed, then the toast reads "Removed step write and 3 arrows" with Undo, the card closes and focus is on `done`'s card.
- Given `done`, the last step in the file, when it is removed, then focus is on the canvas.
- Given a removed step, when Undo is pressed and the host says it can't be put back, then "Couldn't put back step write" says why.
- Given `sort`, the first step, when Remove step is pressed, then nothing is removed and the first-step line is under the button and announced.
- Given `sort` with two arrows, when "Remove arrow 1" is pressed, then "Removed the arrow from sort to approve" shows and focus is on the row "→ write on done"; removing that one too puts focus on Add.
- Given a host that can't change the file, then removing an arrow shows "Couldn't change step sort" and both rows stay.
