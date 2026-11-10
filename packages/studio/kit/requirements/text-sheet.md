# kit.text-sheet

- Status: active
- Since: 0.1.0
- Source: HAL-3517; base component specs 15.3 (Sheet: the text sheet, rev. 47), 17.3 and 23 A1

The kit's `TextSheet` shall be a full-screen sheet, as the picker sheet's frame, whose top bar shows the field's label as its title 16px in and Done at the right as a `primary` `lg` button, with no Close. Its body shall show the field's hint in `text-small` `fg-muted` at the top, then one textarea that fills the rest of the screen, with no border, padding 12px 16px, `text-input-touch` text, never shorter than 3 lines (96px), named by the title and described by the hint. Every change to the text shall go to `onChange`, so that the screen saves as you type; Enter shall add a line. When the user presses Done or Android back, the sheet shall call `onDone`. While the sheet has an `error`, it shall show it as a Field error under the hint, mark the textarea `aria-invalid` and describe it by the error, and Done and Android back shall move focus into the textarea instead of calling `onDone`. A `saveError` shall show as a `danger` Callout in the alert slot above the textarea, and Done shall still close the sheet.

## Examples

- Given a text sheet "Instructions",
  when the user types a line,
  then `onChange` is called with the whole text.
- Given a text sheet with the error "Add a description.",
  when the user presses Done,
  then the sheet stays open and focus moves into the textarea.
- Given a text sheet with the save error "Couldn't save. Try again.",
  when the user presses Done,
  then `onDone` is called.
