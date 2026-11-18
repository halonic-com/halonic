# code-editor.tab-key

- Status: active
- Since: unreleased
- Source: HAL-329 files flow 3.3 (new, accessibility); UX checklist part 2 (F-D12, F-D13); component specs 24.7; HAL-1293

The code editor shall make the Tab key indent with spaces (never a tab character) and shall never trap a keyboard user: pressing Esc and then Tab, or pressing Ctrl M, lets Tab move focus out of the editor, and the editor tells its owner when Tab starts or stops moving focus.

## Examples

- Given the cursor is at the start of an empty line, when the user presses Tab, then two spaces are inserted.
- Given three lines are selected, when the user presses Tab, then each line is indented by two spaces; Shift Tab takes it back.
- Given the user pressed Esc, when they press Tab, then the editor leaves Tab to the browser and nothing is inserted.
- Given the user pressed Esc and then typed a letter, when they press Tab, then it indents again.
- Given the user presses Ctrl M, then Tab moves focus and the owner is told "on"; Ctrl M again turns it off.
