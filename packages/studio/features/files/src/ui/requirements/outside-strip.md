# files.ui.outside-strip

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 4.6; microcopy rev 78 section 7; HAL-10534; HAL-11117

The file tab shall show, above the editor, a strip when the file has unsaved changes and changed or was deleted outside Halonic, with **Keep mine**, **Load theirs** and Compare. Keep mine keeps the user's text, Load theirs takes the one in the folder and Compare, when the two don't change the same lines, can also combine both. Each choice is saved at once as one undo step, so Undo brings the other text back, and the editor takes focus again. A file without unsaved changes that changed outside Halonic reloads quietly and shows the toast "Reloaded a.agent.yaml: changed outside Halonic".

## Examples

- Given `a.agent.yaml` has unsaved changes and changed outside Halonic, then the tab shows the strip "△ a.agent.yaml changed outside Halonic." with **Keep mine**, **Load theirs** and **Compare**, and the editor stays and can be typed in.
- Given the user chooses **Load theirs**, then the folder's text is saved at once, the strip goes, the editor takes focus, and Undo brings the user's text back.
- Given the user chooses **Keep mine** in the strip, then their text is saved, the strip goes and the editor takes focus.
- Given `a.agent.yaml` has no unsaved changes and its text changed outside Halonic, then it reloads and the toast "Reloaded a.agent.yaml: changed outside Halonic" shows; given it was deleted outside Halonic, the same toast shows; given its text did not change, nothing is reloaded and no toast shows.
- Given the user chooses **Compare**, then yours and the file in the folder show side by side with **Keep mine** and **Use the other one**.
- Given the two texts can be combined, then **Combine both** shows too; given they can't, it doesn't.
- Given the user chooses one, then the choice is saved, Compare closes, and the editor shows the saved text.
- Given a choice can't be saved, then the reason shows and Compare stays open.
- Given the file was deleted outside Halonic while it had unsaved changes, then the strip reads "a.agent.yaml was deleted outside Halonic." with **Keep mine**, which writes it back, and **Close**, which leaves it deleted.
- Given the file has no outside change, then no strip shows.
