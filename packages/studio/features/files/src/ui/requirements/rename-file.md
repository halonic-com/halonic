# files.ui.rename-file

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 5 (T5-F10 to F12); microcopy 7, 19.7; checklist 8.11; HAL-1293, HAL-10902, HAL-11382

The file tree shall edit a file's name in its own row, with no dialog, when F2 is pressed on a focused file. The field starts with the name, all but its extensions selected. **Enter** or leaving the row shall apply the name and **Escape** shall put the old name back; a name left as it was changes nothing. The name shall be checked as it is typed: a name with a `/`, with no text, or that is taken shall show its sentence under the field at once, and a name the host refuses shall show its sentence there too and keep the field. When the focus left the row and the host refuses, the row shall keep the typed name and a toast that stays shall say "Couldn't rename *name*: *reason*." with **Try again**; the toast shall go when the row closes (Escape or a rename that works) or settles again, only one shall show at a time, and **Try again** shall rename to the name the row holds then. Under the field, while a name is typed that changes the id of a file named in other files, a line shall say "Also updates *n* places: *names*": up to 5 names in full, more than 5 as 4 names and "and *n* more", and a routine as "*name* (routine)". The line shall not be read out again as the name is typed; only the refusal shall be announced, politely. The field shall be named "Rename *name*". A name that works shall move the file inside its folder, show the toast "Renamed to *path*" with **Undo**, and give focus to the renamed row at its new place when Enter or Escape ended the edit. When the focus left the row, it shall stay where the user put it and only the tree's Tab stop shall move to the renamed row. When *n* places in other files name the file by its id, the toast shall not repeat them: it reads only "Renamed to *path*" with **Undo**. The file shall open at its new path only when it was the open one. **Undo** shall move the file back while the rename is the newest change, and shall say "Couldn't move *path* back" with the host's sentence when it can't.

## Examples

- Given `models.yaml` is focused, when the user presses F2, then its row shows a field with `models.yaml`, `models` selected, and no dialog opens.
- Given the field holds `providers.yaml`, when the user presses Enter, then the host renames `models.yaml` to `providers.yaml`, the toast reads "Renamed to providers.yaml" with Undo, and the row `providers.yaml` has focus.
- Given the user presses Escape, then the row shows `models.yaml` again, has focus, and the host is not asked.
- Given the host refuses with "providers.yaml already exists.", then that sentence shows under the row and the field stays.
- Given the focus left the row and the host refuses, then the row keeps the typed name and a toast with **Try again** stays; given Escape closes the row, then the toast goes and nothing is renamed later; given the name is edited first, then **Try again** renames to the edited name.
- Given 3 places name the collection while the name is typed, then the line under the field reads "Also updates 3 places: Daily digest, Support triage (routine)" and the toast after the rename reads only "Renamed to *path*".
- Given the renamed file was not the open one, then no tab changes; given it was, the tab shows the new path.
- Given Undo is pressed after another change, then "Couldn't move *path* back" shows with the host's sentence.
