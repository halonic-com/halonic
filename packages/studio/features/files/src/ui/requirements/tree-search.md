# files.ui.tree-search

- Status: active
- Since: unreleased
- Source: HAL-20744 (P5 of the HAL-20617 build plan, the Code screen); the search field of the two-column layout, `kit.search-field`

The Files view shall show a search field named "Search files" above the file tree. While the field holds text, the view shall show only the files whose path holds that text, whatever the case, each under its folders with those folders open, and shall say how many files match in a status line, such as "3 files". When the person closes a folder while the field holds text, the folder shall stay closed until the text changes. If no file matches, then the view shall show "No files match “*text*”." and "Check the spelling, or search for part of the name." in place of the tree. When the field is emptied, or the person presses Escape in it, the view shall show the whole tree again with the folders the person had opened before. When another feature asks the view to show a path, the view shall empty the field first. When a file's tab asks to rename the file (`files.ui.file-tab-header`), the view shall empty the field and open the folders above that file, so the file's row shows its name field.

## Examples

- Given the folder has `src/checkout/totals.ts`, `src/checkout/cart.ts` and `tests/subtotal.test.ts`,
  when the person types "Total",
  then the tree shows `totals.ts` under `src` and `checkout`, and `subtotal.test.ts` under `tests`, all open, and the status line reads "2 files".
- Given the person types "checkout/",
  then every file in the folder `checkout` shows.
- Given one file matches,
  then the status line reads "1 file".
- Given the person types "invoice" and no file has it in its path,
  then the view reads "No files match “invoice”." and shows no tree.
- Given the folder `src` was closed before the search and "total" is typed,
  when the person presses Escape in the field,
  then the field is empty and `src` is closed again.
- Given "total" is typed and the person closes `tests`,
  then `tests` stays closed; when they type "totals" and then "total" again, it is open again.
- Given `docs` is open, "total" is typed and the person closes `tests`,
  when they press Escape in the field,
  then `docs` is open and `src` and `tests` are closed, as before the search.
- Given "invoice" is typed and the Library asks to show `docs/guide.md`,
  then the field is empty and the row `guide.md` shows.
- Given no folder is open, "total" is typed and the tab of `src/checkout/totals.ts` asks to rename it,
  then the field is empty, `src` and `checkout` are open and the row `totals.ts` shows its name field.
