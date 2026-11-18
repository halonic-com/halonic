# Decision: Studio says "Deleted" instead of "moved to the trash", and trust says only what it gates today

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12643 (team decision on the C52 Studio claims check, HAL-12644: change the words, not the flow)
- Kind: user-visible

There is no trash: saving a delete runs `fs::remove_file`, and Undo works only while the delete is the
newest step. So deleting a Library item or a file now says "Deleted *name*", "This *kind* was deleted"
and "Couldn't delete *name*: *reason*." instead of "moved to the trash". The flow, the toasts, Undo and
focus don't change.

Studio runs don't check trust yet (HAL-12409); trust gates only routines and listed connectors. Until
HAL-12409 lands, a workspace not trusted yet says "Not trusted yet. Its routines and connectors stay off."
instead of "Halonic won't start programs or call real models from this workspace." HAL-12409 puts the
full wording back with the check itself. No test was weakened: the same assertions check the new words.

## Covers

- library.library-delete
- workspace.trust-section
- files.tree.keyboard
- files.ui.delete-file
- files.ui.file-menu
- files.ui.file-tab-header
