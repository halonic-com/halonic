# kit.text-area

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 3, 23 A6 and A8

The kit's `TextArea` shall draw the same box as the `Input`, in the same states. It shall grow with its text up to `maxRows` lines (5 by default) and then scroll inside. When the user presses Enter, it shall add a line. When `submitOnCtrlEnter` is set and the user presses Ctrl Enter or ⌘ Enter in a form, it shall submit the form, except while an input method is composing. Without `submitOnCtrlEnter`, which is off by default, or outside a form, it shall pass that key on to the screen's own handler. Its line limit shall have a px fallback from the line-height token for an engine without the `lh` unit. A press anywhere in its box shall put the caret in its text. A hidden TextArea shall not keep a 0px height once it is shown, and it shall fit its text again when its width changes.

## Examples

- Given a `TextArea` with `submitOnCtrlEnter` in a form,
  when the user presses Ctrl Enter in it,
  then the form is submitted; when the user presses Enter alone, it isn't.
- Given a `TextArea` without `submitOnCtrlEnter` in a form,
  when the user presses Ctrl Enter in it,
  then the form isn't submitted, and its `onKeyDown` gets the key.
- Given the same `TextArea`,
  when the user presses Ctrl Enter with `isComposing` true, or with the key code 229,
  then the form isn't submitted.
- Given a `TextArea` outside a form with an `onKeyDown`,
  when the user presses Ctrl Enter in it,
  then `onKeyDown` gets the key.
