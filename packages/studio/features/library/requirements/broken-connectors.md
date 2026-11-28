# library.broken-connectors

- Status: active
- Since: unreleased
- Source: HAL-16820 (part 1c of HAL-14370); C348 on HAL-14317, ST4, option A

Where a connector file didn't load, the Library's Connectors kind shall keep a row for it in its hub (or with the workspace's shared connectors), from the shared list of files with errors (`studio.files-with-errors`): its name, in the error state (`shell.overview.error-row`) with the chip "1 problem" or "*n* problems" and the reason "Line *n*: *reason*" of its first error. A click or Enter on the row shall open the file at that line (`files.open-at-line`). Its ⋮ menu shall hold only **Open file**, **Show in Files** where the window has the Files view, and **Delete**, which deletes the file as the file tree does (`files.ui.delete-file`), with focus on the next row and back on the row after Undo. The search shall find the row by its name or its file name. A hub whose only connector file is broken shall show that row, not "No connectors in *hub* yet". While any connector file is broken, the Connectors chip shall show their count as a danger count (`kit.filter-chip-count`, "Connectors 1"), which a screen reader reads as "Connectors, 1 problem", whichever kind the Library shows.

## Examples

- Given Support's `crm.connector.yaml` has the error "url must start with https://" on line 3,
  when Connectors shows,
  then Support has the row crm.connector.yaml with "1 problem" and "Line 3: …", and no "No connectors in Support yet".
- Given that row,
  when it is clicked,
  then the file opens with the cursor on line 3.
- Given that row's ⋮,
  when it opens,
  then it holds Open file and Delete, and no Open in new tab.
- Given that file, when Skills shows,
  then the Connectors chip reads "Connectors, 1 problem".
