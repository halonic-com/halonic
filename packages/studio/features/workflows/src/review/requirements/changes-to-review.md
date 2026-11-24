# workflows.review.changes-to-review

- Status: active
- Since: unreleased
- Source: HAL-17297 (T14 PR 14b-2); AI changes 1.2, 1.3 and section 3; review panel notes 2 to 5; HAL-1307 plan, T14

When the assistant has changes to review in a workflow's file, the workflow page shall show the shell's item bar (`shell.item-review-bar`) in the line under its header. A step the assistant added or changed shall have an edge on its card on the canvas, in its mark's colour; the mark (`shell.change-mark`) of the picked step's change, and the marks of the changes no step on the canvas shows (a workflow field, a removed step, step positions, or a change to the whole file), shall show above the canvas. **Previous** and **Next** shall show Flow, pick the change's step on the canvas (or no step, for a change at none) and move the focus to its mark. **Accept** and **Reject** on a mark, and **Accept all** and **Reject all** on the bar, shall each be one decision, with a toast "Accepted 3 changes in Support reply" or "Rejected 1 change in Support reply" and **Undo**. A change that needs others, such as an arrow to a step the assistant added, shall be decided with them: its mark shall name the changes its Accept also accepts and its Reject also rejects, and the toast shall count them all. On a file the assistant created, its mark's Reject shall say **Reject and delete file**. When the file changed outside Halonic since, the bar shall say "Changed outside Halonic" with **Compare**, which opens the workflow's file. When an edit of the person's accepts a change, the page shall say "Change accepted by your edit" politely. Where the app has no changes to review the page shall show neither bar nor marks.

## Examples

- Given the assistant changed the step `write` of Support reply,
  when the person presses **Next**,
  then `write` is picked on the canvas, with an edge, and the focus is on its mark above the canvas.
- Given the assistant changed the workflow's name,
  when the person presses its mark's **Accept**,
  then a toast "Accepted 1 change in Support reply" has **Undo**.
- Given the assistant made `start` go to a step `check` it added,
  when `start`'s mark shows,
  then it says "Accepting this also accepts “Step added: Check”", and its Accept says "Accepted 2 changes in Support reply".
- Given the assistant created the workflow, then its one mark "New" has **Reject and delete file**.
- Given the file changed outside Halonic, when the person presses **Accept all**, then **Compare** opens the workflow's file.
- Given the person renames the workflow the assistant renamed, when that accepts the change, then "Change accepted by your edit" is said politely.
