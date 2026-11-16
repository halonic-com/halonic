# files.ui.rename-file

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 5 (T5-F10 to F12); microcopy 7; HAL-1293, HAL-10902

The file tree shall open a dialog named "Rename file" when F2 is pressed on a focused file. It shall have one field, "New path", that starts with the file's path and has the file's name selected. While the user types, the dialog shall say "*path* already exists." under the field when another file has the path, and shall say "Also updates *n* place(s)" when *n* places in other files name the file by its id and would change. **Rename** shall stay pressable; the file's own path, a path with no file name, outside the workspace or in the local data, and a path the host refuses shall show their sentence under the field with the text selected and the dialog open. A path that works shall move the file, close the dialog, show the toast "Renamed to *path*" and open the file at its new path.

## Examples

- Given the file `library/collections/claims.collection.yaml` is focused, when the user presses F2, then the dialog opens with that path and `claims.collection.yaml` selected.
- Given the path is left as it is, when the user presses Rename, then "That is the file's own path." shows and the host is not asked.
- Given `library/collections/orders.collection.yaml` has a file, when the user types it, then "library/collections/orders.collection.yaml already exists." shows.
- Given 3 places name the collection, when the user types a new name, then "Also updates 3 places" shows; given 1, "Also updates 1 place".
- Given the host moves the file, then the dialog closes, the toast reads "Renamed to *path*" and the window opens that file.
