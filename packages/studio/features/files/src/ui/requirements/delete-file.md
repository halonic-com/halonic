# files.ui.delete-file

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 5; flow-library 4 (the same delete, no dialog); HAL-10902; HAL-11381

The file tree shall move a file to the trash with no dialog when Delete is pressed on a focused file. The toast shall read "Moved *full path* to the trash" with **Undo**; when *n* places in other files name the file by its id it shall end with a full stop and have the second line "*n* places now show an error until you update them." (or "1 place now shows an error until you update it."). **Undo** shall bring the file back while the delete is the newest change, and shall say "Couldn't put *full path* back" with the host's sentence when it can't. When the host refuses, a toast that stays shall say "Couldn't move *full path* to the trash: *reason*." with **Try again**. An open tab of the deleted file shall keep its text greyed and read-only under the strip "This file was moved to the trash" with **Undo** (said once to a screen reader, **Undo** focused), and shall never write the file again; Undo shall open the editor on the file again. Focus in the tree shall go to the next row, else the previous one, else the folder, and after Undo to the restored row. A tab whose file is gone for another reason shall say "This file isn't in this workspace any more." with **Go to Files**.

## Examples

- Given `agents/models.yaml` is focused, when the user presses Delete, then the host removes `agents/models.yaml` and the toast reads "Moved agents/models.yaml to the trash" with Undo.
- Given 2 places name the deleted skill, then the toast reads "Moved SKILL.md to the trash." with "2 places now show an error until you update them."
- Given the host refuses with "This skill has other files in its folder, so it can't be deleted here yet.", then a toast that stays says "Couldn't move SKILL.md to the trash: This skill has other files in its folder, so it can't be deleted here yet." with Try again.
- Given Undo is pressed after another change, then "Couldn't put models.yaml back" shows with the host's sentence.
- Given `a.md` is open in a tab and is deleted, then the tab shows its text greyed with "This file was moved to the trash" and Undo, and typing changes nothing.
