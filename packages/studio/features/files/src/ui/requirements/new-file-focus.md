# files.ui.new-file-focus

- Status: active
- Since: unreleased
- Source: HAL-12215 (F2 of the Studio check HAL-12213); files flow 8.10

The Files view shall open a file made with **New file** with the cursor in the file's editor, not on the tab's heading, so the user can type at once. A file opened from the tree, a link or a search shall keep the focus where it was.

## Examples

- Given the host makes `hubs/a.yaml`, then the new tab opens with focus in the editor.
- Given the user presses Enter on `models.yaml` in the tree, then the tab opens and focus stays in the tree.
- Given a new file's tab was opened once, when the user opens the same file again later, then focus is not moved.
