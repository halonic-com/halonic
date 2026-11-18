# files.ui.delete-file

- Status: active
- Since: unreleased
- Source: HAL-329 files flow 5; flow-library 4 (the same delete, no dialog); HAL-10902; HAL-11381; HAL-12368 (UX check L6)

The file tree shall delete a file with no dialog when Delete is pressed on a focused file. The toast shall read "Deleted *full path*" with **Undo**; when *n* places in other files name the file by its id it shall end with a full stop and have the second line "*n* places now show an error until you update them." (or "1 place now shows an error until you update it."). **Undo** shall bring the file back while the delete is the newest change, and shall say "Couldn't put *full path* back" with the host's sentence when it can't. When the host refuses, a toast that stays shall say "Couldn't delete *full path*: *reason*." with **Try again**; when the refusal names a next step, because trying again can't help, the toast that stays shall have the host's sentence as its title and the step as its second line, with no **Try again**. An open tab of the deleted file shall keep its text greyed and read-only under the strip "This file was deleted" with **Undo** (said once to a screen reader, taking no focus), and shall never write the file again; Undo shall open the editor on the file again. Focus in the tree shall go to the next row, else the previous one, else the folder, and after Undo to the restored row. A tab whose file is gone for another reason shall say "This file isn't in this workspace any more." with **Go to Files**.

## Examples

- Given `agents/models.yaml` is focused, when the user presses Delete, then the host removes `agents/models.yaml` and the toast reads "Deleted agents/models.yaml" with Undo.
- Given 2 places name the deleted skill, then the toast reads "Deleted skills/pdf/SKILL.md." with "2 places now show an error until you update them."
- Given the host refuses with "a.md isn't here any more.", then a toast that stays says "Couldn't delete dir/a.md: a.md isn't here any more." with Try again.
- Given `skills/pdf` holds other files besides `SKILL.md`, when `skills/pdf/SKILL.md` is deleted, then a toast that stays says "Studio can't delete a skill that has other files in its folder yet." with "To delete pdf, delete the folder skills/pdf in File Explorer." and no Try again.
- Given Undo is pressed after another change, then "Couldn't put agents/models.yaml back" shows with the host's sentence.
- Given `notes/a.md` is open in a tab and is deleted, then the tab shows its text greyed and read-only at once with "This file was deleted" and Undo, and typing changes nothing.
- Given Undo can no longer bring `notes/a.md` back, then the tab says "This file isn't in this workspace any more." with Go to Files.
