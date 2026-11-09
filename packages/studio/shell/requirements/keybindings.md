# shell.keybindings

- Status: active
- Since: 0.1.0
- Source: HAL-171, HAL-223, HAL-973; plan 5.3

The shell shall let a feature add shortcuts through `keybindings.add`, optionally with a `when` of context names joined by `&&`, each optionally negated with `!`. The shell shall count a context named more than once in a `when` as one condition. When keys are pressed, the shell shall pick, of the bindings for those keys whose `when` holds in the active contexts, the one with the most conditions, and between equally specific ones the first registered. The shell shall match keys regardless of case and modifier order, for letters and for named keys alike: `ctrl+arrowup` and `Ctrl+ArrowUp` are the same keys. The modifiers shall be `Ctrl`, `Alt`, `Shift` and `Meta`, with `Cmd` meaning `Meta`, and `Mod` meaning `Meta` when the host tells the shell it runs on macOS and `Ctrl` otherwise. The shell shall accept as a key a single character, `F1` to `F24`, or a named key from the shell's list (such as `ArrowUp`, `Enter`, `Escape`, `PageDown`, `Space`), and shall read `Esc` as `Escape`, a single space (as `KeyboardEvent.key` gives for the space bar) as `Space` when it is the whole keys or directly follows the last `+`, as in `Ctrl+ `, and a trailing `+` or `Plus` as the plus key, as in `Ctrl++`. If a binding is a bare `Escape`, with or without a `when`, then the shell shall throw a `ShellError` that names the feature and points to the close stack (`shell.close-stack`), because Esc closes layers in rank order there. If the same keys and `when` are bound twice, the keys or `when` are malformed, a `when` asks for a context and its negation, a key name isn't known, a binding isn't a plain object, or a binding names a command no feature adds, then the shell shall throw a `ShellError`.

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
- Given `Ctrl++` bound to `zoom.in`,
  when Ctrl and the plus key are pressed,
  then `zoom.in` runs.
- Given `Mod+S` bound to `files.save` and the host says it runs on macOS,
  when Cmd+S is pressed,
  then `files.save` runs; on Windows or Linux it runs on Ctrl+S instead.
- Given `Shift+Esc` bound to `palette.close` and `Ctrl+Space` to `palette.open`,
  when Shift+Escape is pressed, or Ctrl with the key `" "`,
  then `palette.close` and `palette.open` run.
- Given _palette_ binds `Esc` to `palette.close`,
  when the shell is created,
  then a `ShellError` naming _palette_ and the close stack is thrown.
- Given `Ctrl+K` bound when `editorFocused && editorFocused` and when `editorFocused && selection`,
  when Ctrl+K is pressed with both contexts active,
  then the second binding runs, because the repeated term counts once.
- Given a binding whose `when` is `a && !a`,
  when the shell is created,
  then a `ShellError` is thrown, because that condition can never hold.
