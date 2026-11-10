# kit.select

- Status: active
- Since: 0.1.0
- Source: HAL-3514, HAL-3517; base component specs 4, 3, 15.3 and 0.2

The kit's `Select` shall pick one value from a list of options and call `onChange` with the value the user picks. On desktop it shall be a native `<select>` without the system's look, drawn in the Input's box for each state (default, hover, focus, disabled and with an error) with a 16px `fg-muted` chevron at the end and 32px of end padding for it, and a press anywhere in the box shall open the list. An option marked unavailable shall stay in the list and not be pickable. While its value isn't one of the options, it shall show its placeholder, in the placeholder colour, as an option that can't be picked. Inside a Field it shall take its id, its description and its required and invalid states from the Field. When the presentation context is `phone`, it shall instead render a button that looks like the phone Input (at least 48px high, 16px text) with a 20px chevron, named by the Field's label (or its `aria-label`) and then the shown value, with `aria-haspopup="dialog"`, and described by the Field's line; the label shall point at the button. Pressing the button shall open the kit's picker sheet, titled with the Field's label (or its `aria-label`), with the shown value checked and an unavailable option listed but not pickable, with its reason, when it has one, as its description. With no options the sheet shall show the Select's empty text in place of the list. A picked value shall be saved at once and close the sheet; Close shall keep the value; either way focus shall return to the button. On a phone only the button shall be rendered as a control, with a hidden input carrying the value when the Select has a `name`, which shall not be posted while the Select is disabled.

## Examples

- Given a Select of Sonnet and Haiku with the value "sonnet", on desktop,
  when the user picks Haiku,
  then `onChange` is called with "haiku".
- Given a Select in a Field with the error "smart no longer exists. Choose another model." and the value "smart",
  when it renders,
  then it shows "Choose a model" in `fg-subtle`, its box has the danger edge, and it is `aria-invalid`.
- Given a Select in the Field "Model" with the value "sonnet", on a phone,
  when it renders,
  then it is a button named "Model, Sonnet" with `aria-haspopup="dialog"`, and there is no native select.
- Given that phone Select,
  when the user presses the button and picks Haiku in the picker sheet "Model",
  then `onChange` is called with "haiku", the sheet closes and focus is back on the button.
- Given a phone Select with GPT-5 unavailable for the reason "Only models Claude Code can use",
  when the user opens the picker sheet,
  then GPT-5 can't be picked and is described by "Only models Claude Code can use".
- Given a phone Select with no options and the empty text "No models yet. Add a provider in Settings.",
  when the user opens the picker sheet,
  then the sheet shows that text and no options.
