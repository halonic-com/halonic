# code-editor.problem-marks

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 4.1 and 4.2 (gutter icons from Noah's N1, F8); HAL-10534, HAL-11196

The code editor shall underline each problem it is given with a wavy line, mark the line in the gutter with a ✕ for an error or a △ for a warning, tell its owner when the user clicks that mark, move the cursor to a problem's line and column on request, and tell its owner when the user presses F8 or Shift F8.

## Examples

- Given an error at line 2, column 8 over the word `nope`, then `nope` is underlined and line 2 has a ✕ in the gutter.
- Given a warning and an error on one line, then the gutter shows the ✕.
- Given the problems are set to none, then no underline and no mark remain.
- Given the user clicks the ✕ on line 3, then the owner is told line 3; given a line with no problem, it isn't told.
- Given the owner asks to go to line 3, column 5, then the cursor sits there; a line past the end goes to the last line.
- Given the user presses F8, then the owner is told 1; Shift F8 tells it -1.
