# Decision: Studio says "Deleted" instead of "moved to the trash", and trust says only what it gates today

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12643 (team decision on the C52 Studio claims check, HAL-12644: change the words, not the flow)
- Kind: user-visible

There is no trash: saving a delete runs `fs::remove_file`, and Undo works only while the delete is the
newest step. So deleting a Library item or a file now says "Deleted *name*", "This *kind* was deleted"
and "Couldn't delete *name*: *reason*." instead of "moved to the trash". The flow, the toasts, Undo and
focus don't change.

Studio runs don't check trust yet (HAL-12409). What trust gates today is a routine's Run now, starting
a connector to review its tools, and sending a key to a non-standard model address; for a plugin, its
tools (fact-check on HAL-12655, wording from Chief on HAL-12646). Until HAL-12409 lands, a workspace not
trusted yet says "Not trusted yet. Its routines and connectors won't start, and keys won't go to
non-standard model addresses." instead of "Halonic won't start programs or call real models from this
workspace." Removing trust says "Its routines and connectors won't start until you trust it again." for
a workspace and, in Settings › Trusted sources, "Its tools won't run until you trust it again." for a
plugin, told apart by its record's `hpf1:` fingerprint. HAL-12409 puts the full wording back with the
check itself. No test was weakened: the same assertions check the new words, and a new test covers the
plugin line.

## Covers

- library.library-delete
- workspace.trust-section
- workspace.trusted-sources
- files.tree.keyboard
- files.ui.delete-file
- files.ui.file-menu
- files.ui.file-tab-header
