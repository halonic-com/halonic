# files.ui.problems-list

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 4.1 and 4.2 (`files.editor.revalidates-while-typing`); accessibility pass 5.2; HAL-10534; HAL-11383

The file tab shall show the problems of its file in a list under the editor, headed "Problems (n)", errors before warnings and then in the order of the text, each row "Line n: " and the sentence, named for a screen reader with its severity. It shall check again 300 ms after the files last changed, never while typing, and show the result in the list and as squiggles and gutter icons in the editor. Choosing a row, by click or Enter, shall put the editor's cursor at that line and column and focus the editor; clicking a gutter icon shall open the list and focus its row; F8 and Shift F8 shall move between problems and announce the one reached as "Line 2, error: …". With none it shall say "No problems.", and for a file that opens read-only because it is large, which is not checked, "This file is too long to check." The list shall collapse to its header, which keeps the count. When changes in the file cause problems in other files that were not there when the tab opened, a line under the list shall say "Your edits here cause n problems in other files." with the first file as a link that opens it.

## Examples

- Given `hub.yaml` has a warning on line 1 and errors on lines 5 and 3, then the list reads "Problems (3)" and its rows are the error on line 3, the error on line 5, then the warning.
- Given the user clicks the row "Line 3: unknown model", then the editor's cursor goes to line 3 and the editor has focus.
- Given a file with no problems, then the list says "No problems." under "Problems (0)".
- Given `big.md` opens read-only because it is large, then the list reads "This file is too long to check." under "Problems (0)".
- Given the user presses the header, then the rows hide, the header still reads "Problems (3)" and says it is collapsed; pressing again shows them.
- Given the user types, then the problems are checked once, 300 ms after the last key.
- Given deleting an agent in this file makes a workflow file show an error that the first check did not have, then the line "Your edits here cause 1 problem in another file." shows with the workflow's path as a link.
- Given a problem in another file that was there when the tab opened, then no such line shows.
