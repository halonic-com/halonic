# source-control.history-go-back

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.9 and 2.14; design-source-control (HAL-176), "what happens in git"; design-phone (HAL-552) 5.5

The source control feature shall offer **Go back to this version** for a version: under its details on the desktop, and in the bottom bar of its page on a phone. When it is pressed, the source control feature shall go back at once, without a dialog: when there are changes not in a version yet, it shall first keep them as a version called "Before going back"; then it shall put every file of the workspace folder as that version has it, deleting a file the version doesn't have, so the files show as changes. The source control feature shall never reset, check out or stash, so History only grows. The source control feature shall show the toast "Went back to "*version*"." with **Undo**, which puts the files back as they were and leaves "Before going back" in History. The source control feature shall keep a copy of what the files held before it writes them; when the copy or "Before going back" can't be kept, no file shall change. When a file changed while it was being written, the files already written shall be put back and a danger toast shall say why; when putting them back fails too, a warning Callout shall say "Went back only partly to "*version*"." with the files not as they were and **Try again**, which writes only the files that still differ from the version, and focus shall move to it. When a version newer than this one is in the shared copy, the line "Your team keeps the versions you shared after this one. Going back makes a new change you can share." shall be shown before the button. While a merge of updates is started, Go back shall wait, with "Finish getting updates first." in place of that line as its reason. The source control feature shall find the files that differ from the version through the shell's `git diff --name-status`, which is on the allow-list as it is.

Not covered yet: waiting for a save in progress (Save A), and a run that is live while you go back.

## Examples

- Given Sorter changed since "Sorter replies in Dutch" and Triage is new since,
  then Go back writes Sorter as that version has it, deletes Triage, shows "Went back to "Sorter replies in Dutch"." with Undo, and Undo brings both back.
- Given changes not in a version yet,
  then Go back first records them as "Before going back".
- Given "Before going back" can't be recorded,
  then no file changes and a danger toast says why.
- Given a file that changed on disk while going back,
  then the files already written are put back and a danger toast says why.
- Given that and the files can't be put back either,
  then a warning Callout names them, with Try again, and has focus.
- Given a shared copy that has a newer version,
  then "Your team keeps the versions you shared after this one. Going back makes a new change you can share." shows before Go back.
- Given a started merge,
  then Go back is unavailable with "Finish getting updates first.".
