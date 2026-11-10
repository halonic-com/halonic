# kit.dialog-return-focus

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 8 and 23 A2

When a `Dialog` closes, the kit shall move focus to the element that had focus when it opened, if that element is not `body` or the root element, is still in the document and is not under `inert`; else to the element its `returnFocus` returns, looked up after the commit that closed the dialog; else to the page's `h1`. Focus shall never be left on `body` while one of these exists.

## Examples

- Given a Dialog opened from a row's More button,
  when the row is deleted and the Dialog closes,
  then focus moves to the row `returnFocus` returns, the next row.
- Given a Dialog opened while nothing had focus,
  when it closes,
  then focus moves to the element `returnFocus` returns, else to the page's `h1`.
