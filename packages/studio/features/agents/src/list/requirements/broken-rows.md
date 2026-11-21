# agents.list.broken-rows

- Status: active
- Since: unreleased
- Source: HAL-14902 (part 1 of HAL-14370); C348 on HAL-14317, ST4, option A

Where an agent file in a hub didn't load, the Agents list shall keep a row for it in its hub, from the shared list of files with errors (`studio.files-with-errors`): its name (the file's own `name`, else its file name), in the error state (`shell.overview.error-row`) with the chip "1 problem" or "*n* problems" and the reason "Line *n*: *reason*" of its first error. A click or Enter on the row shall open the file at that line (`files.open-at-line`), and its ⋮ menu shall hold only **Open file**, **Show in Files** where the window has the Files view, and **Delete**, which deletes the file as the file tree does (`files.ui.delete-file`). The search shall find the row by its name or its file name. A hub whose only agent file is broken shall show that row, not "No agents in *hub* yet".

## Examples

- Given Support's `writer.agent.yaml` doesn't read as YAML, with its first error on line 2,
  when the Agents list shows,
  then Support has the row writer.agent.yaml with "1 problem" and "Line 2: …", and no "No agents in Support yet".
- Given that row,
  when it is clicked,
  then `writer.agent.yaml` opens with the cursor on line 2.
- Given that row's ⋮ menu on the desktop,
  when it opens,
  then it lists Open file, Show in Files and Delete.
- Given the search "writer.agent",
  when the list filters,
  then the row still shows.
