# files.ui.problems-panel

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 4.1, 4.2 and 4.5 (gutter icons from Noah's N1, F8, "This file is too long to check."); HAL-10534, HAL-11196

The file tab shall show, under the code editor, a collapsible Problems panel that lists the file's errors and warnings, each as "Line n: " and what is wrong, errors first and then by line, and goes to the line and column of a row the user picks. It shall check the whole workspace with the file's unsaved changes applied when the tab opens and 300 ms after the last change, and never announce the count while the user types. When the user's edits made problems in other files, it shall say so under the list with the first of those files as a link. It shall not check a file over the size limit, and say "This file is too long to check." in place of its problems. F8 and Shift F8 shall go to the next and the previous problem, and a click on a mark in the gutter shall open its row.

## Examples

- Given `a.agent.yaml` has an error on line 3 and a warning on line 1, then the header reads "Problems (2)" and the rows read "Line 3: …" first and "Line 1: …" second.
- Given the file has no problems, then the panel reads "No problems."
- Given the user collapses the panel, then only the header shows, still with its count.
- Given the user picks a row, then the editor's cursor goes to that line and column.
- Given the user presses F8, then the cursor goes to the next problem in the panel's order, round from the last to the first, and the problem is announced once; Shift F8 goes back.
- Given the user clicks the ✕ in the gutter of line 3, then the panel is open and that row has focus.
- Given the user types, then the workspace is checked again only 300 ms after the last key, and the newest answer wins.
- Given another file already had a problem when the tab opened, then it isn't counted as caused here; given a later check shows two new problems in other files, then the line "Changes in this file cause 2 problems in other files." shows with the first file as a link that opens it.
- Given the file is over 1,000,000 characters, then the panel says "This file is too long to check." and lists nothing.
