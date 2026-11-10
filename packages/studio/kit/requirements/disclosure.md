# kit.disclosure

- Status: active
- Since: 0.1.0
- Source: HAL-3519; base component specs 18.1

The kit's `Disclosure` shall render a native `<details>` whose `<summary>` is a row at least 48px high, padded 0 16px, with its words in `text-body-strong` (`tone="label"`, the default) or `text-body` (`tone="value"`) and a 20px chevron in `fg-subtle` at the right, hidden from screen readers, that points down when closed and up when open with no animation. It shall leave opening and closing to the browser, so a click, Enter and Space all work and screen readers hear whether it's open, put nothing clickable inside the summary, hide the browser's own triangle, and draw no line of its own. Its content shall follow in the 16px inset. With a `label`, it shall show that label as a caption above the row, hidden from screen readers, and say the same words inside the summary, so the row is named "label, summary".

## Examples

- Given `<Disclosure summary="How the budget works">…</Disclosure>`,
  when the user activates the row,
  then it opens in place, and activating it again closes it.
- Given `<Disclosure label="What's in it" summary="3 items" tone="value">…</Disclosure>`,
  when it renders,
  then "What's in it" is shown above the row and the row is read as "What's in it, 3 items".
