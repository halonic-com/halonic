# kit.copy-button

- Status: active
- Since: 0.1.0
- Source: HAL-700; Google setup flow design, section 3.1; base component specs 18.5

When the user clicks a `CopyButton`, the kit shall put the button's text on the clipboard, show "Copied" in place of "Copy" for `COPIED_FOR_MS`, and announce "Copied" through a status region that is in the page before the click. If the clipboard API is missing or refuses, then the kit shall copy by selecting the text and running the browser's copy command. If that fails too, then the button shall keep saying "Copy" and a hint next to it shall say "Couldn't copy. Select the text and copy it yourself."

## Examples

- Given a `CopyButton` with the text "Halonic (own app)",
  when the user clicks it,
  then the clipboard holds "Halonic (own app)", the button shows "Copied" and the status region says "Copied".
- Given the button shows "Copied",
  when `COPIED_FOR_MS` has passed,
  then it shows "Copy" again and the status region is empty.
- Given a page without a secure context, so `navigator.clipboard` is missing,
  when the user clicks the button,
  then the text is copied through the hidden text box, which is removed afterwards, and the focus goes back where it was.
- Given the clipboard API and the copy command both refuse,
  when the user clicks the button,
  then the hint says "Couldn't copy. Select the text and copy it yourself."
