# files.ui.file-menu

- Status: active
- Since: unreleased
- Source: HAL-12215 (F1 of the Studio check HAL-12213); files flow 3.3; UX checklist 8.3 and 8.11

The Files tree shall give each file row a menu with **Open**, **Open in new tab**, **Rename**, **Copy path** and **Delete** (last, as the item that removes), opened by a right-click, by Shift F10 or the Menu key on the focused row, or by the row's ⋮ button, which shows while the row is hovered or has focus. **Rename** shall edit the name in the row, **Delete** shall move the file to the trash as the Delete key does, and **Copy path** shall put the file's path on the clipboard and say "Copied *path*". A folder row has no menu.

## Examples

- Given the user right-clicks `models.yaml`, then a menu named "models.yaml menu" opens with Open, Open in new tab, Rename, Copy path and Delete.
- Given `models.yaml` is focused, when the user presses Shift F10, then the same menu opens with focus on Open.
- Given the menu is open and the user picks **Rename**, then the row shows the name field as F2 does.
- Given the menu is open and the user picks **Delete**, then the file moves to the trash and the toast reads "Moved models.yaml to the trash · Undo".
- Given the user picks **Copy path** on `agents/a.agent.yaml`, then the clipboard holds `agents/a.agent.yaml` and the toast reads "Copied agents/a.agent.yaml".
- Given the user picks **Open in new tab**, then the file opens in a new tab next to the active one.
- Given the user presses the ⋮ button of a row, then the menu opens below it.
- Given the user right-clicks a folder, then no menu opens.
