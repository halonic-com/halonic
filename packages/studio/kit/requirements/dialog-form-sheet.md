# kit.dialog-form-sheet

- Status: active
- Since: 0.1.0
- Source: HAL-3517; base component specs 8 (Dialog, on a phone), 15.3 (the form sheet), 15.4 and 3

While the layout is the phone's, a `form` Dialog shall be a form sheet: still a `<dialog>` opened with `showModal()`, filling the screen as the picker sheet does, with the phone top bar showing Close at the left and the title, which shall take focus, and no ✕ or Cancel button. Its fields shall be padded 12px 16px and 16px apart in a body that scrolls on its own, and its confirming button shall be in the Dialog's `confirm.variant` (`primary` unless it's `danger`), 48px and full width in an ActionBar that rides on the keyboard, as the last row under the body, submitting the sheet's one form, so that Enter in a one-line field confirms too. Close and Escape shall call `onCancel` without asking. While `busy`, Close shall be unavailable with the busy confirming button as its reason, and Close, Escape and a submit shall do nothing. A failed submit's `error` shall be read through the alert slot as the last thing in the body, above the bar, 16px under the last field; without one, the body shall end 12px under the last field. The parts inside shall know they're in a form sheet, so that a long field stays a textarea. On desktop, and for a confirmation on a phone, the Dialog shall stay a centred box.

## Examples

- Given the New agent form Dialog on a phone,
  when it opens,
  then it fills the screen with Close at the top left, the title focused, and Create agent at the bottom.
- Given the New agent form sheet with a field focused,
  when the user presses Enter,
  then `onConfirm` is called.
- Given a busy form sheet,
  when the user presses Close,
  then nothing happens, and Close is described by the busy Create agent.
- Given a Delete agent form Dialog with `confirm.variant: "danger"` on a phone,
  when it opens,
  then Delete agent is drawn in `danger` at the bottom.
