# files.tree.keyboard

- Status: active
- Since: unreleased
- Source: HAL-329 files flow 3.3 (new, accessibility); changed by the save-model decision, HAL-1102; req-files (HAL-110); HAL-1293

The file tree shall let the user move between rows with the up and down arrow keys, open and close folders with the right and left arrow keys, open the focused file in a tab with Enter, start Rename with F2, and move the focused file to the trash with the Delete key.

## Examples

- Given the closed folder "hubs" is focused, when the user presses →, then "hubs" opens; ← closes it again.
- Given "models.yaml" is focused, when the user presses Enter, then it opens in a tab.
- Given "models.yaml" is focused, when the user presses Delete, then it moves to the trash right away and a toast reads "models.yaml moved to the trash · Undo".
- Given a row is focused, when the user presses Home or End, then the first or last shown row is focused; typing letters focuses the next row whose name starts with them; `*` opens the folders next to the focused row.
