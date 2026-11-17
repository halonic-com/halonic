# files.ui.rename-file

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 5 (T5-F10 to F12); microcopy 7, 19.7; checklist 8.11; HAL-1293, HAL-10902, HAL-11382

The file tree shall edit a file's name in its own row, with no dialog, when F2 is pressed on a focused file. The field starts with the name, all but its extensions selected. **Enter** or leaving the row shall apply the name and **Escape** shall put the old name back; a name left as it was changes nothing. A name with a `/`, with no text, or that the host refuses shall show its sentence under the row (when Enter was pressed) and keep the field; when the focus left the row it shall show the sentence in a toast and the row shows the old name. A name that works shall move the file inside its folder, show the toast "Renamed to *path*" with **Undo**, and give focus to the renamed row at its new place. When *n* places in other files name the file by its id, the toast shall have the second line "Also updated *n* places: *names*." with the names of what holds them. The file shall open at its new path only when it was the open one. **Undo** shall move the file back while the rename is the newest change, and shall say "Couldn't move *path* back" with the host's sentence when it can't.

## Examples

- Given `models.yaml` is focused, when the user presses F2, then its row shows a field with `models.yaml`, `models` selected, and no dialog opens.
- Given the field holds `providers.yaml`, when the user presses Enter, then the host renames `models.yaml` to `providers.yaml`, the toast reads "Renamed to providers.yaml" with Undo, and the row `providers.yaml` has focus.
- Given the user presses Escape, then the row shows `models.yaml` again, has focus, and the host is not asked.
- Given the host refuses with "providers.yaml already exists.", then that sentence shows under the row and the field stays.
- Given 3 places name the collection, then the toast's second line reads "Also updated 3 places: Daily digest, Support triage."
- Given the renamed file was not the open one, then no tab changes; given it was, the tab shows the new path.
- Given Undo is pressed after another change, then "Couldn't move *path* back" shows with the host's sentence.
