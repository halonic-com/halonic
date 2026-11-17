# files.ui.rename-file

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 5 (T5-F10 to F12); microcopy 7, 19.7; checklist 8.11; HAL-1293, HAL-10902, HAL-11382

The file tree shall edit a file's name in its own row, with no dialog, when F2 is pressed on a focused file. The field starts with the name, all but its extensions selected. **Enter** or leaving the row shall apply the name and **Escape** shall put the old name back; a name left as it was changes nothing. The field is named "Rename *name*" and the typed name shall be checked on every key: a name with a `/`, with no text, or that is already taken shall show its sentence under the row, and Enter shall then keep the field. A name the host refuses shall show its sentence under the row too. When the focus left the row, the refusal shall show in a toast that stays, "Couldn't rename *name*: *reason*." with **Try again**, and the row shall keep the typed name; **Try again** applies it again. While a name is typed that works, the line "Also updates *n* places: *names*" shall show under the field when other files name the file by its id. A name that works shall move the file inside its folder, show the toast "Renamed to *path*" with **Undo**, and give focus to the renamed row at its new place when Enter or Escape ended the edit. When the focus left the row, it shall stay where the user put it and only the tree's Tab stop shall move to the renamed row. The file shall open at its new path only when it was the open one. **Undo** shall move the file back while the rename is the newest change, and shall say "Couldn't move *path* back" with the host's sentence when it can't.

## Examples

- Given `models.yaml` is focused, when the user presses F2, then its row shows a field with `models.yaml`, `models` selected, and no dialog opens.
- Given the field holds `providers.yaml`, when the user presses Enter, then the host renames `models.yaml` to `providers.yaml`, the toast reads "Renamed to providers.yaml" with Undo, and the row `providers.yaml` has focus.
- Given the user presses Escape, then the row shows `models.yaml` again, has focus, and the host is not asked.
- Given the host refuses with "providers.yaml already exists.", then that sentence shows under the row and the field stays.
- Given 3 places name the collection and the user types a new name, then the line under the field reads "Also updates 3 places: Daily digest, Support triage", and the toast after Enter reads only "Renamed to *path*".
- Given the user types the name of a file that exists, then "*path* already exists." shows under the row at once, and Enter keeps the field.
- Given the focus leaves the row and the host refuses, then a toast "Couldn't rename models.yaml: The disk is full." stays with **Try again**, and the field still holds the typed name.
- Given the renamed file was not the open one, then no tab changes; given it was, the tab shows the new path.
- Given Undo is pressed after another change, then "Couldn't move *path* back" shows with the host's sentence.
