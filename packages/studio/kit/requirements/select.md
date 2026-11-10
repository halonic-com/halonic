# kit.select

- Status: active
- Since: 0.1.0
- Source: HAL-3514; base component specs 4, 3 and 0.2

The kit's `Select` shall pick one value from a list of options and call `onChange` with the value the user picks. On desktop it shall be a native `<select>` without the system's look, drawn in the Input's box for each state (default, hover, focus, disabled and with an error) with a 16px `fg-muted` chevron at the end and 32px of end padding for it, and a press anywhere in the box shall open the list. An option marked unavailable shall stay in the list and not be pickable. While its value isn't one of the options, it shall show its placeholder, in the placeholder colour, as an option that can't be picked. Inside a Field it shall take its id, its description and its required and invalid states from the Field. When the presentation context is `phone`, it shall instead render a button that looks like the phone Input (at least 48px high, 16px text) with the chevron, named by the Field's label (or its `aria-label`) and then the shown value, and described by the Field's line; the label shall point at the button. Pressing the button shall open the system's picker until the kit's picker sheet exists, and a picked value shall be saved at once and focus shall return to the button. On a phone only the button shall be reachable by the keyboard and screen readers.

## Examples

- Given a Select of Sonnet and Haiku with the value "sonnet", on desktop,
  when the user picks Haiku,
  then `onChange` is called with "haiku".
- Given a Select in a Field with the error "smart no longer exists. Choose another model." and the value "smart",
  when it renders,
  then it shows "Choose a model" in `fg-subtle`, its box has the danger edge, and it is `aria-invalid`.
- Given a Select in the Field "Model" with the value "sonnet", on a phone,
  when it renders,
  then it is a button named "Model, Sonnet", and the native select is hidden from screen readers and the Tab order.
- Given that phone Select,
  when the user presses the button and picks Haiku in the system's picker,
  then `onChange` is called with "haiku" and focus is back on the button.
