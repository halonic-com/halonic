# app.workspace-undo

- Status: active
- Since: 0.1.0
- Source: one workspace-wide undo with 200 steps; old `Studio.undo`, `Studio.redo`

When files of an open workspace are changed, the kernel shall record one undo step per change, for the whole workspace, keeping the latest 200. When the user undoes, the unsaved changes shall be as before the last step, and redo shall bring them back. When a new change is made after an undo, redo shall no longer be possible. Where changes in a row share a coalesce key, they shall make one step. When the user undoes a change that was saved since, the file shall read its text from before the change and be unsaved.

## Examples

- Given a workflow file changed three times,
  when the user undoes once,
  then the unsaved text is that after the second change, and redo gives the third again.
- Given 201 changes,
  when the user undoes as often as possible,
  then 200 steps go back and the first change stays.
- Given a change, an undo and a new change,
  when the user redoes,
  then nothing happens.
- Given three edits of one file with the file as coalesce key,
  when the user undoes once,
  then all three are gone.
- Given a saved change of `a.yaml` from `v0` to `v1`,
  when the user undoes,
  then `a.yaml` reads `v0` and is unsaved; redo gives `v1`, saved.
- Given a saved new file `b.yaml`,
  when the user undoes,
  then `b.yaml` reads as missing, an unsaved delete.
- Given a saved delete of `c.yaml`,
  when the user undoes,
  then `c.yaml` reads its old text again, unsaved.
- Given nothing changed,
  when the user undoes,
  then nothing happens and `false` is returned.
