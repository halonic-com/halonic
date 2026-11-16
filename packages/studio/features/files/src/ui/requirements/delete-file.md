# files.ui.delete-file

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 5; flow-library 4 (the same delete, no dialog); HAL-10902

The file tree shall move a file to the trash with no dialog when Delete is pressed on a focused file. The toast shall read "Moved *name* to the trash" with **Undo**; when *n* places in other files name the file by its id it shall end with a full stop and have the second line "*n* places now show an error until you update them." (or "1 place now shows an error until you update it."). **Undo** shall bring the file back while the delete is the newest change, and shall say "Couldn't put *name* back" with the host's sentence when it can't. When the host refuses, a toast that stays shall say "Couldn't move *name* to the trash: *reason*." with **Try again**.

## Examples

- Given `models.yaml` is focused, when the user presses Delete, then the host removes `models.yaml` and the toast reads "Moved models.yaml to the trash" with Undo.
- Given 2 places name the deleted skill, then the toast reads "Moved SKILL.md to the trash." with "2 places now show an error until you update them."
- Given the host refuses with "This skill has other files in its folder, so it can't be deleted here yet.", then a toast that stays says "Couldn't move SKILL.md to the trash: This skill has other files in its folder, so it can't be deleted here yet." with Try again.
- Given Undo is pressed after another change, then "Couldn't put models.yaml back" shows with the host's sentence.
