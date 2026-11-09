# kit.text-area

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 3, 23 A6 and A8

The kit's `TextArea` shall draw the same box as the `Input`, in the same states. It shall grow with its text up to `maxRows` lines (5 by default) and then scroll inside. When the user presses Enter, it shall add a line. When the user presses Ctrl Enter or ⌘ Enter, it shall submit its form, except while an input method is composing.

## Examples

- Given a `TextArea` in a form,
  when the user presses Ctrl Enter in it,
  then the form is submitted; when the user presses Enter alone, it isn't.
- Given the same `TextArea`,
  when the user presses Ctrl Enter with `isComposing` true, or with the key code 229,
  then the form isn't submitted.
