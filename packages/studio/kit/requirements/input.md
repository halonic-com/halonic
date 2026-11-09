# kit.input

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 3 and 0.2

The kit's `Input` shall draw one box per state: default, with an error, read-only and disabled, with the text field's own focus look (an accent edge and a soft ring) while its text has focus. A press anywhere in the box, outside a button in it, shall put the caret in its text. A disabled box shall show the `not-allowed` cursor. On a phone the box shall be at least 48px high and its text 16px, and a trailing icon button shall keep its `sm` look with a 48px hit area, so the box stays 48px. Under a coarse pointer on a screen wider than a phone the box shall be at least 40px high, and under any coarse pointer its text 16px.

## Examples

- Given an `Input` in a Field with an error,
  when it renders,
  then its box has the danger edge and the danger focus ring.
- Given an `Input` with `readOnly`,
  when it renders,
  then its box has the `surface-subtle` fill and no hover edge.
