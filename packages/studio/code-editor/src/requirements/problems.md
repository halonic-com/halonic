# code-editor.problems

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 4.1 (squiggles, gutter icons ✕ and △); accessibility pass 5.2 (F8, Shift F8); HAL-10534

The code editor shall underline each problem it is given from its line and column to the end of the word, mark its line in the gutter with ✕ for an error or △ for a warning (an error wins on a line with both), keep both on the right text while the user types, and tell its owner when the gutter icon is clicked. F8 and Shift F8 shall move the cursor to the next and previous problem, wrapping at the ends, and tell the owner which one. It shall also move the cursor to a line and column on request.

## Examples

- Given `model: nope` on line 2 has an error at column 8, when the problems are set, then "nope" is underlined as an error and line 2 has a ✕ in the gutter.
- Given a line has a warning and an error, then its gutter icon is the ✕.
- Given a problem on line 3 and the user types a line above it, then the underline stays under the same word.
- Given problems on lines 2 and 4 and the cursor on line 1, when the user presses F8, then the cursor goes to line 2, again to line 4, and once more back to line 2; Shift F8 goes the other way.
- Given there are no problems, when the user presses F8, then nothing moves and the owner is not told.
- Given the user clicks the gutter icon of line 2, then the owner is told line 2; a click on a line with no problem tells nothing.
- Given the owner asks for line 3 column 5, then the cursor is there and the editor has focus; a line past the end goes to the last line.
