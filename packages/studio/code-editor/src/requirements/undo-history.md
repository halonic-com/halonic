# code-editor.undo-history

- Status: active
- Since: 0.1.0
- Source: HAL-329 files flow 3.3; save-model decision, HAL-1102; component specs 24.7; req-files (HAL-110); HAL-1293; HAL-10536

The code editor shall keep its own undo history, never CodeMirror's, so that Ctrl Z undoes the last edit and Ctrl Shift Z or Ctrl Y does it again, joins typing within half a second into one step, forgets the redo steps when the user edits again, and starts a new history when a different text is loaded.

## Examples

- Given the user typed "a" and then "b" within half a second, when they press Ctrl Z, then both letters are gone.
- Given the user typed "a", waited, and typed "b", when they press Ctrl Z, then only "b" is gone.
- Given the user undid an edit, when they press Ctrl Shift Z, then the edit is back.
- Given the user undid an edit and typed something else, then there is nothing to redo.
- Given a different file's text is loaded, then there is nothing to undo.
