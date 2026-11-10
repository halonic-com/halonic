# kit.input-leading-button

- Status: active
- Since: 0.1.0
- Source: HAL-3520; base component specs 3 (the leading button, revision 14) and 23.3 L10; visual review kit T1-F46

The kit's `Input` shall take, at the start of its box, either a leading icon or a `leadingButton`, never both, which its type shall enforce. The leading button shall be a real `<button type="button">` named by its `label`, which carries the feature's verb and the value ("Choose the first colour, now #3B8BFF"), with the feature's glyph inside, at most 16px and hidden from screen readers. The button shall come before the text, so Tab reaches the button and then the text. Its hit area shall be 24px square, centred on the glyph, 4px from the box's left edge, with the text starting 8px after it; on a phone the hit area shall be the 48px square at the left of the box, 48px high from its outer edge, with the text starting 8px after it, at 56px. When the user clicks it, the kit shall call its `onClick`, and the text shall not take focus. The button shall show the general focus ring, and the box's own focus look shall show only while the text has focus. The button shall have no fill of its own; a hover over the box shall be the Input's hover. While the Input is disabled or read-only, the button shall be disabled and its glyph at 45%. A button that opens a popover shall say so with `aria-haspopup="dialog"` and `aria-expanded`, and while open point `aria-controls` at it.

## Examples

- Given an Input "First colour" with a leading button "Choose the first colour, now #3B8BFF",
  when the user presses Tab from before it,
  then focus goes to the button, and the next Tab to the text.
- Given that Input,
  when the user clicks the button,
  then its `onClick` is called once and the text doesn't take focus.
- Given that Input with `readOnly`,
  when it renders,
  then the button is disabled.
- Given that button with `expanded` true and `controls` "first-colour-popover",
  when it renders,
  then it has `aria-haspopup="dialog"`, `aria-expanded="true"` and `aria-controls="first-colour-popover"`.
