# source-control.change-list

- Status: active
- Since: 0.1.0
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.3; req-source-control (HAL-110) revision 4, `source-control.changes.discard-per-change`; save model 3.4

The Changes page shall list the changed files and, under each file's path, what changed in it as `describeFileChange` gives it: the Important changes first under "Important", each with its before → after, then the others. A change that has parts shall have Undo this change, which sets those parts back to how the last version has them, keeps the rest of the file as it is, and happens at once without a question; a toast "Change undone" shall offer Undo, which puts the change back, or, when the file changed in the meantime, shows a toast "Couldn't put the change back" and why. When another change in the file builds on a change, that change's Undo this change shall be unavailable and the page shall say "<that change> uses this. Undo that change first.". Nothing shall be written when the file changed since the page read it; the page shall then say "Couldn't undo this change." and why. A file that can't be read as text, or that no item kind places, shall show one line, "New", "Deleted" or "Changed", without Undo this change.

## Examples

- Given `agents/triage.agent.yaml` changed its model and its instructions,
  when the Changes page opens,
  then "Important" lists the instructions change first and the model change after it, each with Undo this change.
- Given the model change of that agent,
  when the person presses Undo this change,
  then `model` is back to its last version, the instructions change stays, and a toast offers Undo.
- Given the person edited the file in another editor after the page read it,
  when they press Undo this change,
  then nothing is written and the page says the file changed while they were looking.
- Given `README.md` changed,
  then it shows "Changed" and no Undo this change.
