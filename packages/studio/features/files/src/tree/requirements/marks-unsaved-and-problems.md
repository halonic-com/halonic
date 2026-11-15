# files.tree.marks-unsaved-and-problems

- Status: active
- Since: 0.1.0
- Source: HAL-10 migration checklist U4, U32 (Now); changed by the save-model decision, HAL-1102; req-files (HAL-110); HAL-1293. Unsaved marks are gone; the id keeps "unsaved" so links still work

The file tree shall show each file's and folder's count of errors and of warnings, and mark each file and folder that changed outside Halonic and waits for the user's choice in Compare with the "not saved" mark (not the amber "needs you" dot, which is only for the Inbox).

## Examples

- Given `hubs/p/agents/a.agent.yaml` has an edit with 1 error,
  when the user shows "Files",
  then the closed folder "hubs" shows an error badge "1"; opened down to the file, "a.agent.yaml" shows the same.
- Given the error is fixed, then no badge shows.
- Given `a.agent.yaml` changed outside Halonic while it has changes of the user's that aren't in a version, then "a.agent.yaml" and its closed folders show the mark until the user chooses in Compare.
- Given the user has just typed in `a.agent.yaml`, then the tree shows no mark for it: saving shows only in the toolbar.
