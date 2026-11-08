# shell.keybindings

- Status: active
- Since: 0.1.0
- Source: HAL-171; plan 5.3

A feature shall add shortcuts through `keybindings.add`, optionally with a `when` of context names joined by `&&`, each optionally negated with `!`. When keys are pressed, the shell shall pick, of the bindings for those keys whose `when` holds in the active contexts, the one with the most conditions, and between equally specific ones the first registered. Keys shall match regardless of case and modifier order, for letters and for named keys alike: `ctrl+arrowup` and `Ctrl+ArrowUp` are the same keys. A key shall be a single character, `F1` to `F24`, or a named key from the shell's list (such as `ArrowUp`, `Enter`, `Escape`, `PageDown`, `Space`). If the same keys and `when` are bound twice, the keys or `when` are malformed, a key name isn't known, a binding isn't a plain object, or a binding names a command no feature adds, then the shell shall throw a `ShellError`.

## Examples

- Given `Ctrl+Z` bound to `app.undo` everywhere and to `codeEditor.undo` when `codeEditorFocused`,
  when Ctrl+Z is pressed with `codeEditorFocused` active,
  then `codeEditor.undo` runs; and with no context active, `app.undo` runs.
- Given `Ctrl+Alt+A` bound when `workspaceFocused`,
  when `alt+ctrl+a` is pressed without `workspaceFocused`,
  then no binding runs.
- Given `Ctrl+S` bound everywhere by _files_ and by _agents_,
  when the shell is created,
  then a `ShellError` naming both features is thrown.
- Given `ctrl+arrowup` bound to `explorer.up`,
  when Ctrl+ArrowUp is pressed,
  then `explorer.up` runs.
