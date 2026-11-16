# source-control.change-list

- Status: active
- Since: 0.1.0
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.3; req-source-control (HAL-110) revision 4, `source-control.changes.discard-per-change`; save model 3.4

The Changes page shall list one row for each changed item, with its icon, its name and one sentence, and no path: the files of one item are one row, a file that no kind places is under "Other files" with a friendly name, and a renamed item says "Renamed from <old name>". The list shall be one Tab stop: ↑ ↓ move between rows and Enter opens the item, which shows what changed in it as `describeFileChange` gives it: the Important changes first under "Important", each with its before → after, then the others. When the open item is gone, as after Undo these changes, focus shall move to the row that took its place, else to the heading, and never stay on the page itself. A change that has parts shall have Undo this change, which sets those parts back to how the last version has them, keeps the rest of the file as it is, and happens at once without a question; a toast "Change undone" shall offer Undo, which puts the change back, or, when the file changed in the meantime, shows a toast "Couldn't put the change back" and why. When another change in the file builds on a change, that change's Undo this change shall be unavailable and the page shall say "<that change> uses this. Undo that change first.". Nothing shall be written when the file changed since the page read it; the page shall then say "Couldn't undo this change." and why. A file that can't be read as text, or that no item kind places, shall show one line, "New", "Deleted" or "Changed", without Undo this change.

## Examples

- Given `agents/triage.agent.yaml` changed its model and its instructions,
  when the person opens the row "triage",
  then "Important" lists the instructions change first and the model change after it, each with Undo this change.
- Given the model change of that agent,
  when the person presses Undo this change,
  then `model` is back to its last version, the instructions change stays, and a toast offers Undo.
- Given the person edited the file in another editor after the page read it,
  when they press Undo this change,
  then nothing is written and the page says the file changed while they were looking.
- Given `README.md` changed,
  then it shows "Changed" and no Undo this change.
