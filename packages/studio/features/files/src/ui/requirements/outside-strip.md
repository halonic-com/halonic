# files.ui.outside-strip

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 4.6; microcopy rev 78 section 7; HAL-10534

The file tab shall show, above the editor, a strip when the file has unsaved changes and changed or was deleted outside Halonic, and Compare, where the user keeps theirs, takes the one in the folder or, when the two don't change the same lines, combines both, which is saved at once as one undo step.

## Examples

- Given `a.agent.yaml` has unsaved changes and changed outside Halonic, then the tab shows the strip "a.agent.yaml changed outside Halonic" with **Compare**, and the editor stays and can be typed in.
- Given the user chooses **Compare**, then yours and the file in the folder show side by side with **Keep mine** and **Use the other one**.
- Given the two texts can be combined, then **Combine both** shows too; given they can't, it doesn't.
- Given the user chooses one, then the choice is saved, Compare closes, and the editor shows the saved text.
- Given a choice can't be saved, then the reason shows and Compare stays open.
- Given the file was deleted outside Halonic while it had unsaved changes, then the strip reads "a.agent.yaml was deleted outside Halonic." with **Keep mine**, which writes it back, and **Close**, which leaves it deleted.
- Given the file has no outside change, then no strip shows.
