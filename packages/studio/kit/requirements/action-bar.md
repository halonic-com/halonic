# kit.action-bar

- Status: active
- Since: 0.1.0
- Source: HAL-3517, HAL-3819; base component specs 15.4 (Bottom action bar, rev. 47), 0.2 and 1

The kit's `ActionBar` shall be the last row of a page's column, not fixed over its content: a `surface` fill with a 1px `border` line on top, padding 12px 16px, the larger of 12px and the bottom safe area below, and no fixed height. It shall draw each of its buttons at `size="touch"` (48px) and full width, in the rows it is given, 8px apart; two buttons in a row shall share it equally with 8px between them, and shall stack, in the same order and each full width, when either label doesn't fit its half. It shall draw a button as `primary`, `danger` or `secondary`, and shall refuse a second `primary` or `danger` button, or one that isn't the first button. It shall show an optional note above the buttons in `text-small`, in its tone, whole. It shall draw an optional lead row, as it is given, on top of the note and the buttons inside the same bar, 8px above the next part. While one of its buttons is busy, the others shall be unavailable with the busy button as their reason, and only that first busy button shall carry the id they point at. A button may take its own `id`, kept while it's busy, and an `unavailable` reason, which shall keep it focusable and make it ignore presses. With `whileTyping="hide"` the bar shall not be shown while a kit text field (one that carries `data-text-entry`: the Input and the TextArea) inside the page's scroll area has focus, through one CSS rule of its own, so that without `:has()` the bar rides, the default.

## Examples

- Given a decision bar with Approve (`primary`) on its own row, then Ask for changes and Reject,
  when it renders,
  then Approve is first and full width, and Ask for changes and Reject share the second row.
- Given a bar whose Approve is busy,
  when the user taps Reject,
  then nothing happens, and Reject is described by the busy Approve.
- Given a bar with `whileTyping="hide"` under a page's scroll area holding a kit Input,
  when the Input has focus,
  then the bar isn't shown.
- Given a bar with a review row as its lead, a note and Accept all,
  when it renders,
  then the review row comes first, then the note, then Accept all, all in one bar.
- Given rows with a `secondary` button before a `primary` one,
  when the bar renders,
  then it throws.
- Given a bar whose first button is Delete agent (`danger`) and whose second is `primary`,
  when the bar renders,
  then it throws.
