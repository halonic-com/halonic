# kit.long-text

- Status: active
- Since: 0.1.0
- Source: HAL-3517; base component specs 3 (The folded long-text field, rev. 5) and 15.3

The kit's `LongText` shall be the kit's TextArea on desktop. On a phone it shall be a `<button>` with `aria-haspopup="dialog"` drawn as the phone Input's box (48px at least, padding 12px), named by its Field's label and described by its text and then the Field's hint or error, showing the text in `text-input-touch`, folded after 8 lines, with long words wrapping, and a trailing 20px chevron in `fg-subtle` top-aligned with the first line. Empty, it shall show its placeholder in `fg-subtle`. With a Field error, its box shall take the `danger` edge and the button `aria-invalid`. It shall take the Input's own focus look. When the user presses it, it shall open the text sheet titled with the Field's label, with the Field's hint and error, whose typing goes to `onChange`. When the text sheet closes with Done, it shall call `onSheetDone` with the text the sheet opened with, and focus shall go back to the field.

## Examples

- Given a LongText in a Field "Instructions" on a phone,
  when it renders,
  then it's a button named "Instructions" and described by its text.
- Given a folded field "Instructions" with "Sort the inbox.",
  when the user opens it, types, and presses Done,
  then `onSheetDone` is called with "Sort the inbox." and focus is back on the field.
- Given an empty required field with the error "Add instructions." on a phone,
  when it renders,
  then the box has a `danger` edge and the error is under it.
