# files.ui.outside-strip

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 4.6; microcopy rev 78 section 7; HAL-10534; HAL-11117; HAL-11383 (microcopy mc 16, design check HAL-11370 F3)

The file tab shall show, above the editor, a strip when the file has unsaved changes and changed or was deleted outside Halonic, with **Compare** only. Compare shows both texts and offers Keep mine, Use the other one and, when the two don't change the same lines, Combine both. Each choice is saved at once as one undo step, so Undo brings the other text back. Compare takes focus when it opens, and the editor takes focus again after a choice or when Compare is cancelled. After a choice a line above the editor says "Keeping yours", "Using the other one" or "Combined" and the same words are announced; the line goes at the next edit. A file without unsaved changes that changed outside Halonic reloads quietly and shows the toast "Reloaded a.agent.yaml: changed outside Halonic".

## Examples

- Given `a.agent.yaml` has unsaved changes and changed outside Halonic, then the tab shows the strip "△ a.agent.yaml changed outside Halonic" (no full stop) with **Compare** only, and the editor stays and can be typed in.
- Given the user chooses **Compare**, then focus moves into Compare, which a screen reader reads as "Compare a.agent.yaml".
- Given Compare is cancelled, then the editor reopens and takes focus.
- Given the user chooses **Use the other one** in Compare, then the folder's text is saved at once, Compare closes, the editor takes focus, "Using the other one" shows above it and is announced, and Undo brings the user's text back.
- Given a choice was made and the user then types, then the line above the editor goes.
- Given `a.agent.yaml` has no unsaved changes and its text changed outside Halonic, then it reloads and the toast "Reloaded a.agent.yaml: changed outside Halonic" shows; given it was deleted outside Halonic, the same toast shows; given its text did not change, nothing is reloaded and no toast shows.
- Given the user chooses **Compare**, then yours and the file in the folder show side by side with **Keep mine** and **Use the other one**.
- Given the two texts can be combined, then **Combine both** shows too; given they can't, it doesn't.
- Given the user chooses one, then the choice is saved, Compare closes, and the editor shows the saved text.
- Given a choice can't be saved, then the reason shows and Compare stays open.
- Given the file was deleted outside Halonic while it had unsaved changes, then the strip reads "a.agent.yaml was deleted outside Halonic." with **Keep mine**, which writes it back, takes focus to the editor and says "Keeping yours", and **Close**, which leaves it deleted.
- Given the file has no outside change, then no strip shows.
