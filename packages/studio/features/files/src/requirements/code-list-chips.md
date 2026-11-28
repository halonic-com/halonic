# files.code-list-chips

- Status: active
- Since: unreleased
- Source: HAL-20990 (PR 2 of 2); HAL-20742 SCREENS.md (final), "1. Code": the list column's chips, picked by the board on 28 Nov 2026

Where Code's page shows its list column (`files.code-page`), the column shall show the kit's one-of filter chips, named "Show", between the search field and the file tree: **All**, which is on when the page opens, and **Problems**. While **Problems** is on, the tree shall list only the files with an error or a warning, under their folders, and the search field shall search among them. While **Problems** is on and no file has an error or a warning, the column shall say "No file has a problem." in place of the tree. When the person picks **Rename** or presses F2 in the content pane's file while **Problems** is on, **All** shall turn on, so the file's row and its name field show. When a rename in the tree, its Undo, or the Undo of a delete ends while **Problems** is on, **All** shall turn on, so the file's row takes the focus at its place even when the file has no problem there. When the person picks **Go to Files** in the content pane while **Problems** is on and no file has a problem, the focus shall move to "No file has a problem."

## Examples

- Given Code's page with an error in `src/checkout/refunds.ts`,
  when the person picks Problems,
  then the tree lists `src`, `src/checkout` and `refunds.ts`, and no other file.
- Given a workspace with no errors or warnings,
  when the person picks Problems,
  then the column reads "No file has a problem."
- Given Problems is on and `README.md` is in the content pane,
  when the person presses F2 in its editor,
  then All is on and the `README.md` row shows its name field.
- Given Problems is on and `src/checkout/refunds.ts` has an error,
  when the person types `checkout` in the search field,
  then the status reads "1 file" and the tree shows only `refunds.ts` under its folders.
- Given Problems is on and `refunds.ts` has an error tied to its name,
  when the person renames it to `refund.ts` in the tree,
  then All is on and the `refund.ts` row has the focus.
