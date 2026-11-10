# kit.filter-chips

- Status: active
- Since: 0.1.0
- Source: HAL-3517; base component specs 15.7 (Filter chips), 0.2, 23 A1, A11 and 23.5

The kit's `FilterChips` shall be a row of chips that filters a list: padding 8px 16px, 8px between chips and 16px between wrapped lines, wrapping rather than scrolling sideways. Each chip shall be a full-radius pill in `text-small`, 28px high on desktop and 32px with a 48px hit area on a phone or a touch screen. An off chip shall be `surface` with a `border-control` edge and `fg-muted` text, filled `surface-subtle` on hover or press; an on chip shall be `accent-soft` with no visible edge (in its own colour when the user asks for more contrast) and `accent-text` at weight 500, with a 12px check before its label, 8px in, so that on and off differ in shape as well as colour. Chips shall show the standard focus ring. Given `options`, the row shall be a radio group of native radios that share one name, named by its `label`, each chip named by its words; when the user picks a chip, the row shall call `onChange` with its value, and show the value it is given. Given `toggles`, the row shall be a group of toggle buttons with `aria-pressed`, named by its `label`; when the user presses one, it shall call that toggle's `onChange` with the opposite state. An `unavailable` toggle shall stay focusable and keep its state in `fg-disabled`, point `aria-describedby` at its reason, and ignore presses.

## Examples

- Given a one-of row "Hub" with All, acme and beta, and All on,
  when the user picks beta,
  then `onChange` is called with `beta`.
- Given a toggle "Test runs" that's off,
  when the user presses it,
  then its `onChange` is called with `true`.
- Given an on chip,
  when it renders,
  then it shows a 12px check before its label in `accent-text` on `accent-soft`.
- Given a toggle "Test runs" with `unavailable: { reason: "why" }`,
  when the user presses it,
  then nothing changes and it is described by "why".
