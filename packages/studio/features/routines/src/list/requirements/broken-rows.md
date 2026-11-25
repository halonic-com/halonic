# routines.list.broken-rows

- Status: active
- Since: unreleased
- Source: HAL-16820 (part 1c of HAL-14370); C348 on HAL-14317, ST4, option A

Where a routine file in a hub didn't load, the Routines list shall keep a row for it in its hub, from the shared list of files with errors (`studio.files-with-errors`): its name (the file's own `name`, else its file name), in the error state (`shell.overview.error-row`) with the chip "1 problem" or "*n* problems" and the reason "Line *n*: *reason*" of its first error. A click or Enter on the row shall open the file at that line (`files.open-at-line`). Its ⋮ menu shall hold only **Open file**, **Show in Files** where the window has the Files view, and **Delete**, which deletes the file as the file tree does (`files.ui.delete-file`), with focus on the next row and back on the row after Undo, as a routine's Delete. The search shall find the row by its name or its file name. A hub whose only routine file is broken shall show that row, not "No routines in *hub* yet"; the list shall not show its "No routines yet" state while a broken routine file sits there, and keeps its sentence under the title.

## Examples

- Given Support's `nightly.routine.yaml` has the error "every needs a time" on line 4,
  when the Routines list shows,
  then Support has the row nightly.routine.yaml with "1 problem" and "Line 4: …", and no "No routines in Support yet".
- Given that row,
  when it is clicked,
  then the file opens with the cursor on line 4.
- Given that row's ⋮,
  when it opens,
  then it holds Open file and Delete, and no Open in new tab.
