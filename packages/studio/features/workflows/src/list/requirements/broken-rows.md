# workflows.list.broken-rows

- Status: active
- Since: unreleased
- Source: HAL-14902 (part 1 of HAL-14370); C348 on HAL-14317, ST4, option A

Where a workflow file in a hub didn't load, the Workflows list shall keep a row for it in its hub, from the shared list of files with errors (`studio.files-with-errors`): its name (the file's own `name`, else its file name), in the error state (`shell.overview.error-row`) with the chip "1 problem" or "*n* problems" and the reason "Line *n*: *reason*" of its first error. A click or Enter on the row shall open the file at that line (`files.open-at-line`). Its ⋮ menu shall hold only **Open file**, **Show in Files** where the window has the Files view, and **Delete**, which deletes the file as the file tree does (`files.ui.delete-file`); a workflow that loaded keeps its row as before, with no ⋮ menu. The search shall find the row by its name or its file name. A hub whose only workflow file is broken shall show that row, not "No workflows in *hub* yet", and the list shall not show its "No workflows yet" state while a broken workflow file sits there.

## Examples

- Given Reports' `weekly-report.workflow.yaml` has the error "options needs at least one choice" on line 11,
  when the Workflows list shows,
  then Reports has the row weekly-report.workflow.yaml with "1 problem" and "Line 11: …", and no "No workflows in Reports yet".
- Given that row,
  when it is clicked,
  then the file opens with the cursor on line 11.
- Given Support reply, which loaded, and the broken row,
  when the list shows,
  then only the broken row has a ⋮ button.
